const router = require('express').Router();
const { db } = require('../db');
const { runBilling } = require('../billing');
const { sendMail } = require('../mailer');
const { wrap, validate, auth, requireRole, HttpError, z, isoDate, pageQuery, today, round2 } = require('../util');

router.use(auth);
const staff = requireRole('admin', 'staff');
const idParam = (req) => { const id = Number(req.params.id); if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id'); return id; };

// "overdue" is derived, never stored, so it can't go stale.
const INV_SELECT = `SELECT i.*, c.name AS customer_name, c.company AS customer_company, s.number AS subscription_number,
  ROUND(i.total - i.amount_paid, 2) AS balance,
  CASE WHEN i.status = 'confirmed' AND i.due_date < @today THEN 1 ELSE 0 END AS overdue,
  CASE WHEN i.status = 'confirmed' AND i.due_date < @today THEN CAST(julianday(@today) - julianday(i.due_date) AS INTEGER) ELSE 0 END AS days_overdue
  FROM invoices i JOIN customers c ON c.id = i.customer_id JOIN subscriptions s ON s.id = i.subscription_id`;

function invoiceDetail(id, customerId) {
  const inv = db.prepare(`${INV_SELECT} WHERE i.id = @id`).get({ id, today: today() });
  if (!inv || (customerId && inv.customer_id !== customerId)) return null;
  inv.lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id').all(id);
  inv.payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_on, id').all(id);
  inv.customer = db.prepare('SELECT name, company, address, email, phone FROM customers WHERE id = ?').get(inv.customer_id);
  return inv;
}

const invQuery = pageQuery.extend({
  overdue: z.enum(['1', '0']).optional(), customer_id: z.coerce.number().int().optional(),
  from: isoDate.optional(), to: isoDate.optional(),
});
// shared by staff list and customer portal list (portal forces customer_id from the token)
function listInvoices(query, forceCustomer) {
  const { page, pageSize, q, status, overdue, from, to } = query;
  const customer_id = forceCustomer ?? query.customer_id;
  const where = [], args = { today: today() };
  if (status) { where.push('i.status = @status'); args.status = status; }
  if (overdue === '1') where.push(`i.status = 'confirmed' AND i.due_date < @today`);
  if (customer_id) { where.push('i.customer_id = @cid'); args.cid = customer_id; }
  if (from) { where.push('i.issue_date >= @from'); args.from = from; }
  if (to) { where.push('i.issue_date <= @to'); args.to = to; }
  if (q) { where.push('(i.number LIKE @q OR c.name LIKE @q OR c.company LIKE @q)'); args.q = `%${q}%`; }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM invoices i JOIN customers c ON c.id = i.customer_id ${w}`).get(args).c;
  const rows = db.prepare(`${INV_SELECT} ${w} ORDER BY i.id DESC LIMIT @limit OFFSET @offset`).all({ ...args, limit: pageSize, offset: (page - 1) * pageSize });
  return { rows, total, page, pageSize };
}

// ---------- billing ----------
router.post('/billing/run', staff, validate(z.object({ as_of: isoDate.optional() })), wrap((req, res) => res.json(runBilling({ asOf: req.body.as_of || today() }))));

// ---------- invoices ----------
router.get('/invoices', staff, validate(invQuery, 'query'), wrap((req, res) => res.json(listInvoices(req.query))));
router.get('/invoices/:id', staff, wrap((req, res) => { const i = invoiceDetail(idParam(req)); if (!i) throw new HttpError(404, 'Invoice not found'); res.json(i); }));

const INV_TRANSITIONS = { draft: ['confirmed', 'cancelled'], confirmed: ['paid', 'cancelled'], paid: [], cancelled: [] };
function move(id, to) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!inv) throw new HttpError(404, 'Invoice not found');
  if (!INV_TRANSITIONS[inv.status].includes(to)) throw new HttpError(409, `A ${inv.status} invoice cannot be ${to === 'cancelled' ? 'cancelled' : 'moved to ' + to}`);
  if (to === 'cancelled' && inv.amount_paid > 0) throw new HttpError(409, 'This invoice has payments recorded and cannot be cancelled');
  db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(to, id);
}
router.post('/invoices/:id/confirm', staff, wrap((req, res) => { move(idParam(req), 'confirmed'); res.json(invoiceDetail(idParam(req))); }));
router.post('/invoices/:id/cancel', staff, wrap((req, res) => { move(idParam(req), 'cancelled'); res.json(invoiceDetail(idParam(req))); }));
router.post('/invoices/confirm-all', staff, wrap((_req, res) => {
  const r = db.prepare(`UPDATE invoices SET status = 'confirmed' WHERE status = 'draft'`).run();
  res.json({ confirmed: r.changes });
}));
router.post('/invoices/:id/send', staff, wrap(async (req, res) => {
  const inv = invoiceDetail(idParam(req));
  if (!inv) throw new HttpError(404, 'Invoice not found');
  if (inv.status !== 'confirmed') throw new HttpError(409, 'Confirm the invoice before sending it');
  const to = inv.customer.email;
  if (!to) throw new HttpError(422, 'This customer has no email address on file');
  await sendMail({ to, subject: `Invoice ${inv.number} from Brightloop`,
    text: `Hi ${inv.customer.name},\n\nInvoice ${inv.number} for ${inv.total.toFixed(2)} is due on ${inv.due_date}.\nPeriod: ${inv.period_start} to ${inv.period_end}.\n\nThank you,\nBrightloop Software` });
  db.prepare('UPDATE invoices SET sent_at = ? WHERE id = ?').run(new Date().toISOString(), inv.id);
  res.json(invoiceDetail(inv.id));
}));

// ---------- payments ----------
router.post('/invoices/:id/payments', staff, validate(z.object({
  method: z.enum(['card', 'bank_transfer', 'cash', 'upi', 'cheque'], { message: 'Pick a payment method' }),
  amount: z.coerce.number({ invalid_type_error: 'Enter an amount' }).positive('Amount must be greater than 0'),
  paid_on: isoDate, note: z.string().trim().max(300).optional().nullable(),
})), wrap((req, res) => {
  const id = idParam(req), b = req.body;
  db.transaction(() => {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!inv) throw new HttpError(404, 'Invoice not found');
    if (inv.status !== 'confirmed') throw new HttpError(409, inv.status === 'draft' ? 'Confirm the invoice before recording payment' : `A ${inv.status} invoice cannot take payments`);
    const balance = round2(inv.total - inv.amount_paid);
    if (b.amount > balance + 0.001) throw new HttpError(422, `Amount is more than the balance of ${balance.toFixed(2)}`, { amount: `Maximum is ${balance.toFixed(2)}` });
    db.prepare('INSERT INTO payments(invoice_id,method,amount,paid_on,note) VALUES (?,?,?,?,?)').run(id, b.method, b.amount, b.paid_on, b.note || null);
    const paid = round2(inv.amount_paid + b.amount);
    db.prepare('UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?').run(paid, paid >= inv.total - 0.001 ? 'paid' : 'confirmed', id);
  })();
  res.status(201).json(invoiceDetail(id));
}));
router.get('/payments', staff, validate(pageQuery.extend({ method: z.string().optional(), from: isoDate.optional(), to: isoDate.optional() }), 'query'), wrap((req, res) => {
  const { page, pageSize, q, method, from, to } = req.query;
  const where = [], args = {};
  if (method) { where.push('p.method = @method'); args.method = method; }
  if (from) { where.push('p.paid_on >= @from'); args.from = from; }
  if (to) { where.push('p.paid_on <= @to'); args.to = to; }
  if (q) { where.push('(i.number LIKE @q OR c.name LIKE @q)'); args.q = `%${q}%`; }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from_ = 'FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN customers c ON c.id = i.customer_id';
  const total = db.prepare(`SELECT COUNT(*) c ${from_} ${w}`).get(args).c;
  const rows = db.prepare(`SELECT p.*, i.number AS invoice_number, c.name AS customer_name ${from_} ${w} ORDER BY p.paid_on DESC, p.id DESC LIMIT @limit OFFSET @offset`).all({ ...args, limit: pageSize, offset: (page - 1) * pageSize });
  res.json({ rows, total, page, pageSize });
}));

// ---------- reports (SQL aggregates only; never load rows into JS) ----------
router.get('/reports/summary', staff, validate(z.object({ from: isoDate.optional(), to: isoDate.optional() }), 'query'), wrap((req, res) => {
  const t = today();
  const from = req.query.from || '0000-01-01', to = req.query.to || '9999-12-31';
  const subs = Object.fromEntries(db.prepare('SELECT status, COUNT(*) c FROM subscriptions GROUP BY status').all().map((r) => [r.status, r.c]));
  const revenue = db.prepare('SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payments WHERE paid_on BETWEEN ? AND ?').get(from, to);
  const invoiced = db.prepare(`SELECT COALESCE(SUM(total),0) v, COUNT(*) n FROM invoices WHERE status != 'cancelled' AND issue_date BETWEEN ? AND ?`).get(from, to);
  const outstanding = db.prepare(`SELECT COALESCE(SUM(total - amount_paid),0) v, COUNT(*) n FROM invoices WHERE status = 'confirmed'`).get();
  const overdue = db.prepare(`SELECT COALESCE(SUM(total - amount_paid),0) v, COUNT(*) n FROM invoices WHERE status = 'confirmed' AND due_date < ?`).get(t);
  const drafts = db.prepare(`SELECT COUNT(*) n FROM invoices WHERE status = 'draft'`).get().n;
  // MRR: normalise every active plan's recurring amount to a month
  const mrr = db.prepare(`SELECT COALESCE(SUM((p.price + COALESCE((SELECT SUM(sl.qty*sl.unit_price) FROM subscription_lines sl WHERE sl.subscription_id = s.id),0)) *
      CASE p.billing_period WHEN 'daily' THEN 30.4167 WHEN 'weekly' THEN 4.3333 WHEN 'monthly' THEN 1 ELSE 1.0/12 END),0) v
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active'`).get().v;
  const byMonth = db.prepare(`SELECT substr(paid_on,1,7) AS month, ROUND(SUM(amount),2) AS revenue FROM payments WHERE paid_on BETWEEN ? AND ? GROUP BY month ORDER BY month DESC LIMIT 12`).all(from, to).reverse();
  const byMethod = db.prepare('SELECT method, ROUND(SUM(amount),2) AS amount FROM payments WHERE paid_on BETWEEN ? AND ? GROUP BY method').all(from, to);
  res.json({ asOf: t, subscriptions: { active: subs.active || 0, byStatus: subs },
    revenue: { collected: round2(revenue.v), payments: revenue.n }, invoiced: { total: round2(invoiced.v), count: invoiced.n },
    outstanding: { amount: round2(outstanding.v), count: outstanding.n }, overdue: { amount: round2(overdue.v), count: overdue.n },
    draftInvoices: drafts, mrr: round2(mrr), byMonth, byMethod });
}));
router.get('/reports/overdue', staff, validate(pageQuery, 'query'), wrap((req, res) => res.json(listInvoices({ ...req.query, overdue: '1' }))));

// ---------- customer portal: identity ALWAYS comes from the token, never from the URL ----------
const myCustomerId = (req) => {
  const c = db.prepare('SELECT id FROM customers WHERE user_id = ?').get(req.user.id);
  if (!c) throw new HttpError(403, 'No customer profile is linked to this account');
  return c.id;
};
router.get('/me/subscriptions', requireRole('customer'), wrap((req, res) => res.json(db.prepare(
  `SELECT s.id, s.number, s.status, s.start_date, s.expiry_date, s.next_invoice_date, p.name AS plan_name, p.billing_period,
     (SELECT ROUND(COALESCE(SUM(sl.qty*sl.unit_price),0)+p.price,2) FROM subscription_lines sl WHERE sl.subscription_id = s.id) AS recurring_amount
   FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.customer_id = ? AND s.status != 'draft' ORDER BY s.id DESC`).all(myCustomerId(req)))));
router.get('/me/invoices', requireRole('customer'), validate(pageQuery, 'query'), wrap((req, res) => {
  const r = listInvoices({ ...req.query }, myCustomerId(req));
  r.rows = r.rows.filter((i) => i.status !== 'draft' && i.status !== 'cancelled'); // customers never see internal drafts
  res.json(r);
}));
router.get('/me/invoices/:id', requireRole('customer'), wrap((req, res) => {
  const i = invoiceDetail(idParam(req), myCustomerId(req));
  if (!i || i.status === 'draft') throw new HttpError(404, 'Invoice not found');
  res.json(i);
}));

module.exports = router;
