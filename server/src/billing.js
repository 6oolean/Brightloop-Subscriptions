// Billing engine. Everything here is idempotent: UNIQUE(subscription_id, period_start)
// on invoices means a re-run, a double-click or two admins clicking at once cannot
// bill the same period twice, and a subscription that was skipped is caught up next run.
const { db, nextNumber } = require('./db');
const { today, addDays, addPeriod, round2 } = require('./util');

const MAX_CATCHUP_PERIODS = 12; // safety cap per subscription per run

const q = {
  due: db.prepare(`SELECT s.*, p.name AS plan_name, p.price AS plan_price, p.billing_period, p.auto_close
                   FROM subscriptions s JOIN plans p ON p.id = s.plan_id
                   WHERE s.status = 'active' AND s.next_invoice_date <= ?
                   ORDER BY s.next_invoice_date, s.id LIMIT ?`),
  lines: db.prepare(`SELECT sl.*, pr.name AS product_name, v.attribute, v.value AS variant_value, COALESCE(t.rate_pct, 0) AS rate
                     FROM subscription_lines sl JOIN products pr ON pr.id = sl.product_id
                     LEFT JOIN product_variants v ON v.id = sl.variant_id
                     LEFT JOIN taxes t ON t.id = sl.tax_id AND t.active = 1
                     WHERE sl.subscription_id = ? ORDER BY sl.id`),
  exists: db.prepare('SELECT 1 FROM invoices WHERE subscription_id = ? AND period_start = ?'),
  subDiscount: db.prepare('SELECT * FROM discounts WHERE id = ? AND applies_to = \'subscription\''),
  productDiscounts: db.prepare(`SELECT * FROM discounts WHERE applies_to = 'product' AND active = 1`),
  discountProducts: db.prepare('SELECT product_id FROM discount_products WHERE discount_id = ?'),
  insInvoice: db.prepare(`INSERT INTO invoices(number,subscription_id,customer_id,period_start,period_end,issue_date,due_date,subtotal,tax_total,discount_total,total)
                          VALUES (@number,@subscription_id,@customer_id,@period_start,@period_end,@issue_date,@due_date,@subtotal,@tax_total,@discount_total,@total)`),
  insLine: db.prepare('INSERT INTO invoice_lines(invoice_id,description,qty,unit_price,tax_amount,amount) VALUES (?,?,?,?,?,?)'),
  bump: db.prepare('UPDATE discounts SET times_used = times_used + 1 WHERE id = ?'),
  advance: db.prepare('UPDATE subscriptions SET next_invoice_date = ? WHERE id = ?'),
  close: db.prepare(`UPDATE subscriptions SET status = 'closed', next_invoice_date = NULL WHERE id = ?`),
};

const termsDays = (terms) => { const m = /(\d+)/.exec(terms || ''); return m ? Number(m[1]) : 0; };

// A discount is usable if active, inside its date window, not exhausted.
function discountUsable(d, onDate) {
  return d && d.active && d.start_date <= onDate && onDate <= d.end_date && (d.usage_limit == null || d.times_used < d.usage_limit);
}

// Pure function: turns a subscription's lines + discounts into invoice numbers.
// Exported so the UI "preview" and the tests use exactly the same maths as billing.
function computeInvoice({ lines, planName, planPrice, billingPeriod, discounts, onDate }) {
  const items = lines.map((l) => {
    const amount = round2(l.qty * l.unit_price);
    return { desc: l.product_name + (l.variant_value ? ` (${l.attribute}: ${l.variant_value})` : ''),
      qty: l.qty, unit: l.unit_price, amount, rate: l.rate, productId: l.product_id, discount: 0 };
  });
  if (planPrice > 0) items.unshift({ desc: `${planName} (${billingPeriod} plan fee)`, qty: 1, unit: planPrice, amount: round2(planPrice), rate: 0, productId: null, discount: 0 });

  const applied = [];
  for (const { d, productIds } of discounts) {
    if (!discountUsable(d, onDate)) continue;
    const scope = d.applies_to === 'subscription' ? items : items.filter((i) => i.productId && productIds.includes(i.productId));
    const base = round2(scope.reduce((s, i) => s + i.amount - i.discount, 0));
    const qty = scope.reduce((s, i) => s + i.qty, 0);
    if (!scope.length || base <= 0 || base < d.min_purchase || qty < d.min_qty) continue;
    const amt = round2(Math.min(base, d.type === 'percent' ? (base * d.value) / 100 : d.value));
    // spread across the lines in scope proportionally so tax is charged on the discounted amount
    let left = amt;
    scope.forEach((i, idx) => {
      const net = i.amount - i.discount;
      const share = idx === scope.length - 1 ? left : round2((amt * net) / base);
      i.discount = round2(i.discount + share); left = round2(left - share);
    });
    applied.push({ id: d.id, name: d.name, amount: amt });
  }

  const outLines = items.map((i) => ({ description: i.desc, qty: i.qty, unit_price: i.unit,
    tax_amount: round2(((i.amount - i.discount) * i.rate) / 100), amount: i.amount }));
  for (const a of applied) outLines.push({ description: `Discount: ${a.name}`, qty: 1, unit_price: -a.amount, tax_amount: 0, amount: -a.amount });
  const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
  const discount_total = round2(applied.reduce((s, a) => s + a.amount, 0));
  const tax_total = round2(outLines.reduce((s, l) => s + l.tax_amount, 0));
  return { lines: outLines, subtotal, discount_total, tax_total, total: round2(subtotal - discount_total + tax_total), applied };
}

// Bill ONE period of ONE subscription inside the caller's transaction.
function billPeriod(sub, asOf) {
  const periodStart = sub.next_invoice_date;
  const periodEnd = addDays(addPeriod(periodStart, sub.billing_period), -1);
  const next = addPeriod(periodStart, sub.billing_period);

  // Past expiry: nothing more to bill. Plans flagged auto_close close themselves.
  if (sub.expiry_date && periodStart > sub.expiry_date) {
    if (sub.auto_close) q.close.run(sub.id); else q.advance.run(null, sub.id);
    return { status: sub.auto_close ? 'closed' : 'expired' };
  }
  if (q.exists.get(sub.id, periodStart)) { q.advance.run(next, sub.id); return { status: 'already_billed' }; }

  const discounts = [];
  if (sub.discount_id) { const d = q.subDiscount.get(sub.discount_id); if (d) discounts.push({ d, productIds: [] }); }
  for (const d of q.productDiscounts.all()) discounts.push({ d, productIds: q.discountProducts.all(d.id).map((r) => r.product_id) });

  const calc = computeInvoice({ lines: q.lines.all(sub.id), planName: sub.plan_name, planPrice: sub.plan_price,
    billingPeriod: sub.billing_period, discounts, onDate: asOf });
  const id = q.insInvoice.run({ number: nextNumber('INV'), subscription_id: sub.id, customer_id: sub.customer_id,
    period_start: periodStart, period_end: periodEnd, issue_date: asOf, due_date: addDays(asOf, termsDays(sub.payment_terms)),
    subtotal: calc.subtotal, tax_total: calc.tax_total, discount_total: calc.discount_total, total: calc.total }).lastInsertRowid;
  for (const l of calc.lines) q.insLine.run(id, l.description, l.qty, l.unit_price, l.tax_amount, l.amount);
  for (const a of calc.applied) q.bump.run(a.id);
  q.advance.run(next, sub.id);
  // auto-close plans end themselves once the last period is billed
  if (sub.auto_close && sub.expiry_date && next > sub.expiry_date) q.close.run(sub.id);
  return { status: 'created', invoiceId: id };
}

const billOne = db.transaction((sub, asOf) => billPeriod(sub, asOf));

function runBilling({ asOf = today(), limit = 100000 } = {}) {
  const result = { asOf, created: 0, skipped: 0, closed: 0, failed: [] };
  for (let pass = 0; pass < MAX_CATCHUP_PERIODS; pass++) {
    const due = q.due.all(asOf, limit);
    if (!due.length) break;
    for (const sub of due) {
      try { // one transaction per subscription: one bad record never blocks the rest
        const r = billOne(sub, asOf);
        if (r.status === 'created') result.created++; else if (r.status === 'closed') result.closed++; else result.skipped++;
      } catch (e) { result.failed.push({ subscription: sub.number, error: e.message }); q.advance.run(sub.next_invoice_date, sub.id); }
    }
    if (result.failed.length) break; // avoid looping on a record that keeps failing
  }
  return result;
}

module.exports = { runBilling, computeInvoice, termsDays };
