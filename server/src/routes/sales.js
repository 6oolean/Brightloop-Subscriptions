const router = require('express').Router();
const { db, nextNumber } = require('../db');
const { wrap, validate, auth, requireRole, HttpError, z, isoDate, pageQuery, today, addDays, addPeriod } = require('../util');

router.use(auth);
const staff = requireRole('admin', 'staff');
const adminOnly = requireRole('admin');
const idParam = (req) => { const id = Number(req.params.id); if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id'); return id; };

// ---------- quotation templates ----------
const tplSchema = z.object({
  name: z.string().trim().min(2, 'Enter a template name').max(100),
  plan_id: z.number({ message: 'Pick a plan' }).int(),
  validity_days: z.coerce.number().int().min(1, 'At least 1 day').max(365),
  lines: z.array(z.object({ product_id: z.number().int(), variant_id: z.number().int().nullable().optional(), qty: z.number().int().min(1) })).min(1, 'Add at least one line'),
});
const tplWithLines = (t) => ({ ...t, lines: db.prepare(`SELECT l.*, p.name AS product_name FROM quotation_template_lines l JOIN products p ON p.id = l.product_id WHERE template_id = ?`).all(t.id) });
const saveTpl = db.transaction((id, b) => {
  if (id == null) id = db.prepare('INSERT INTO quotation_templates(name,plan_id,validity_days) VALUES (?,?,?)').run(b.name, b.plan_id, b.validity_days).lastInsertRowid;
  else { db.prepare('UPDATE quotation_templates SET name=?,plan_id=?,validity_days=? WHERE id=?').run(b.name, b.plan_id, b.validity_days, id); db.prepare('DELETE FROM quotation_template_lines WHERE template_id = ?').run(id); }
  for (const l of b.lines) db.prepare('INSERT INTO quotation_template_lines(template_id,product_id,variant_id,qty) VALUES (?,?,?,?)').run(id, l.product_id, l.variant_id ?? null, l.qty);
  return id;
});
router.get('/quotation-templates', staff, wrap((_req, res) => res.json(db.prepare('SELECT * FROM quotation_templates ORDER BY id DESC').all().map(tplWithLines))));
router.post('/quotation-templates', adminOnly, validate(tplSchema), wrap((req, res) => res.status(201).json(tplWithLines(db.prepare('SELECT * FROM quotation_templates WHERE id=?').get(saveTpl(null, req.body))))));
router.put('/quotation-templates/:id', adminOnly, validate(tplSchema), wrap((req, res) => res.json(tplWithLines(db.prepare('SELECT * FROM quotation_templates WHERE id=?').get(saveTpl(idParam(req), req.body))))));
router.delete('/quotation-templates/:id', adminOnly, wrap((req, res) => { db.prepare('DELETE FROM quotation_templates WHERE id=?').run(idParam(req)); res.status(204).end(); }));

// ---------- subscriptions ----------
const subSchema = z.object({
  customer_id: z.number({ message: 'Pick a customer' }).int(),
  plan_id: z.number({ message: 'Pick a plan' }).int().optional(),
  template_id: z.number().int().optional(),
  start_date: isoDate,
  expiry_date: isoDate.optional().nullable(),
  payment_terms: z.string().trim().min(2).max(40).default('Net 15'),
  discount_id: z.number().int().optional().nullable(),
  lines: z.array(z.object({ product_id: z.number().int(), variant_id: z.number().int().nullable().optional(),
    qty: z.number({ message: 'Quantity must be a number' }).int('Whole numbers only').min(1, 'Quantity must be at least 1'),
    tax_id: z.number().int().nullable().optional() })).optional(),
}).refine((s) => s.plan_id || s.template_id, { message: 'Pick a plan or a quotation template', path: ['plan_id'] })
  .refine((s) => !s.expiry_date || s.expiry_date > s.start_date, { message: 'Expiry must be after the start date', path: ['expiry_date'] })
  .refine((s) => s.template_id || (s.lines && s.lines.length), { message: 'Add at least one line', path: ['lines'] });

// Server always computes unit price (product price + variant extra) so a client cannot set its own price.
function priceLine(l) {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(l.product_id);
  if (!p) throw new HttpError(422, 'A selected product no longer exists or is inactive', { lines: 'Invalid product' });
  let extra = 0;
  if (l.variant_id) {
    const v = db.prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?').get(l.variant_id, p.id);
    if (!v) throw new HttpError(422, `That variant does not belong to ${p.name}`, { lines: 'Invalid variant' });
    extra = v.extra_price;
  }
  return { ...l, variant_id: l.variant_id ?? null, tax_id: l.tax_id ?? null, unit_price: p.sales_price + extra };
}

function checkPlan(plan, start, lines) {
  if (!plan) throw new HttpError(422, 'Plan not found', { plan_id: 'Pick a valid plan' });
  if (plan.available_from && start < plan.available_from) throw new HttpError(422, `This plan is available from ${plan.available_from}`, { start_date: 'Before plan availability' });
  if (plan.available_to && start > plan.available_to) throw new HttpError(422, `This plan closed on ${plan.available_to}`, { start_date: 'After plan availability' });
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  if (qty < plan.min_qty) throw new HttpError(422, `This plan needs a minimum quantity of ${plan.min_qty}`, { lines: `Minimum quantity is ${plan.min_qty}` });
}

const SUB_SELECT = `SELECT s.*, c.name AS customer_name, c.company AS customer_company, p.name AS plan_name, p.billing_period,
  p.allow_pause, p.allow_renew, p.allow_early_close,
  (SELECT ROUND(COALESCE(SUM(sl.qty * sl.unit_price),0) + p.price, 2) FROM subscription_lines sl WHERE sl.subscription_id = s.id) AS recurring_amount
  FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id`;

const subDetail = (id) => {
  const s = db.prepare(`${SUB_SELECT} WHERE s.id = ?`).get(id);
  if (!s) return null;
  s.lines = db.prepare(`SELECT sl.*, pr.name AS product_name, v.attribute, v.value AS variant_value, t.name AS tax_name, t.rate_pct
    FROM subscription_lines sl JOIN products pr ON pr.id = sl.product_id LEFT JOIN product_variants v ON v.id = sl.variant_id
    LEFT JOIN taxes t ON t.id = sl.tax_id WHERE sl.subscription_id = ? ORDER BY sl.id`).all(id)
    .map((l) => ({ ...l, amount: Math.round(l.qty * l.unit_price * 100) / 100 }));
  return s;
};

router.get('/subscriptions', staff, validate(pageQuery.extend({ customer_id: z.coerce.number().int().optional() }), 'query'), wrap((req, res) => {
  const { page, pageSize, q, status, customer_id } = req.query;
  const where = [], args = [];
  if (status) { where.push('s.status = ?'); args.push(status); }
  if (customer_id) { where.push('s.customer_id = ?'); args.push(customer_id); }
  if (q) { where.push('(s.number LIKE ? OR c.name LIKE ? OR c.company LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM subscriptions s JOIN customers c ON c.id = s.customer_id ${w}`).get(...args).c;
  const rows = db.prepare(`${SUB_SELECT} ${w} ORDER BY s.id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
  res.json({ rows, total, page, pageSize });
}));
router.get('/subscriptions/:id', staff, wrap((req, res) => { const s = subDetail(idParam(req)); if (!s) throw new HttpError(404, 'Subscription not found'); res.json(s); }));

router.post('/subscriptions', staff, validate(subSchema), wrap((req, res) => {
  const b = req.body;
  if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(b.customer_id)) throw new HttpError(422, 'Customer not found', { customer_id: 'Pick a valid customer' });
  let planId = b.plan_id, lines = b.lines, validUntil = null;
  if (b.template_id) { // start from a template: copy plan + lines, set quote validity
    const t = db.prepare('SELECT * FROM quotation_templates WHERE id = ?').get(b.template_id);
    if (!t) throw new HttpError(422, 'Template not found', { template_id: 'Pick a valid template' });
    planId = planId || t.plan_id; validUntil = addDays(today(), t.validity_days);
    lines = lines?.length ? lines : db.prepare('SELECT product_id, variant_id, qty FROM quotation_template_lines WHERE template_id = ?').all(t.id);
  }
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
  const priced = lines.map(priceLine);
  checkPlan(plan, b.start_date, priced);
  const id = db.transaction(() => {
    const id = db.prepare(`INSERT INTO subscriptions(number,customer_id,plan_id,start_date,expiry_date,payment_terms,discount_id,quote_valid_until)
      VALUES (?,?,?,?,?,?,?,?)`).run(nextNumber('SUB'), b.customer_id, planId, b.start_date, b.expiry_date || null, b.payment_terms, b.discount_id ?? null, validUntil).lastInsertRowid;
    for (const l of priced) db.prepare('INSERT INTO subscription_lines(subscription_id,product_id,variant_id,qty,unit_price,tax_id) VALUES (?,?,?,?,?,?)').run(id, l.product_id, l.variant_id, l.qty, l.unit_price, l.tax_id);
    return id;
  })();
  res.status(201).json(subDetail(id));
}));

// Lifecycle: Draft -> Quotation -> Confirmed -> Active -> Closed (+ Paused). One map, one place.
const TRANSITIONS = {
  draft: ['quotation', 'closed'],
  quotation: ['draft', 'confirmed', 'closed'],
  confirmed: ['active', 'closed'],
  active: ['paused', 'closed'],
  paused: ['active', 'closed'],
  closed: [],
};
router.post('/subscriptions/:id/transition', staff, validate(z.object({ to: z.enum(['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed']) })), wrap((req, res) => {
  const id = idParam(req), to = req.body.to;
  const s = subDetail(id);
  if (!s) throw new HttpError(404, 'Subscription not found');
  if (!TRANSITIONS[s.status].includes(to)) throw new HttpError(409, `A ${s.status} subscription cannot move to ${to}`);
  if (to === 'confirmed' && s.quote_valid_until && s.quote_valid_until < today()) throw new HttpError(409, `This quotation expired on ${s.quote_valid_until}`);
  if (to === 'paused' && !s.allow_pause) throw new HttpError(409, 'This plan does not allow pausing');
  if (to === 'closed' && s.status === 'active' && !s.allow_early_close && s.expiry_date && s.expiry_date > today()) throw new HttpError(409, 'This plan cannot be closed before its expiry date');
  let next = s.next_invoice_date;
  if (to === 'active') next = s.status === 'paused' ? (next && next > today() ? next : today()) : (next || s.start_date); // resuming never back-bills the paused time
  if (to === 'closed') next = null;
  db.prepare('UPDATE subscriptions SET status = ?, next_invoice_date = ? WHERE id = ?').run(to, next, id);
  res.json(subDetail(id));
}));

router.post('/subscriptions/:id/renew', staff, wrap((req, res) => {
  const s = subDetail(idParam(req));
  if (!s) throw new HttpError(404, 'Subscription not found');
  if (!s.allow_renew) throw new HttpError(409, 'This plan does not allow renewal');
  if (!['active', 'paused'].includes(s.status)) throw new HttpError(409, 'Only active subscriptions can be renewed');
  const base = s.expiry_date && s.expiry_date > today() ? s.expiry_date : today();
  db.prepare('UPDATE subscriptions SET expiry_date = ? WHERE id = ?').run(addPeriod(base, s.billing_period === 'daily' || s.billing_period === 'weekly' ? 'monthly' : s.billing_period), s.id);
  res.json(subDetail(s.id));
}));

module.exports = router;