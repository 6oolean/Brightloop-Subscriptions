// Demo data. `npm run seed` = small set for development, `npm run seed:big` = 5,000 subscriptions for the speed check.
const bcrypt = require('bcryptjs');
const { db, nextNumber } = require('./db');
const { runBilling } = require('./billing');
const { today, addDays, addPeriod } = require('./util');

const BIG = process.argv.includes('--big');
const N_CUSTOMERS = BIG ? 5000 : 30;
let seed = 42; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296); // deterministic
const pick = (a) => a[Math.floor(rnd() * a.length)];

db.pragma('foreign_keys = OFF');
for (const t of ['payments', 'invoice_lines', 'invoices', 'subscription_lines', 'subscriptions', 'quotation_template_lines', 'quotation_templates',
  'discount_products', 'discounts', 'taxes', 'plans', 'product_variants', 'products', 'customers', 'password_resets', 'users', 'counters']) db.exec(`DELETE FROM ${t}`);
db.pragma('foreign_keys = ON');

const hash = bcrypt.hashSync('Admin@1234', 10);
const user = db.prepare('INSERT INTO users(email,password_hash,role,name) VALUES (?,?,?,?)');
user.run('admin@brightloop.test', hash, 'admin', 'Asha Admin');
user.run('staff@brightloop.test', hash, 'staff', 'Sam Staff');
const custUser = user.run('customer@brightloop.test', hash, 'customer', 'Casey Customer').lastInsertRowid;

const tax = db.prepare('INSERT INTO taxes(name,rate_pct) VALUES (?,?)');
const gst18 = tax.run('GST 18%', 18).lastInsertRowid, gst5 = tax.run('GST 5%', 5).lastInsertRowid;

const prod = db.prepare('INSERT INTO products(name,type,sales_price,cost_price,notes) VALUES (?,?,?,?,?)');
const crm = prod.run('Brightloop CRM seat', 'software', 1200, 300, 'Per user per period').lastInsertRowid;
const inv = prod.run('Invoicing module', 'software', 800, 200, null).lastInsertRowid;
const sup = prod.run('Priority support', 'addon', 500, 150, 'Add-on, 4h response').lastInsertRowid;
const sto = prod.run('Extra storage 100GB', 'addon', 250, 60, null).lastInsertRowid;
const variant = db.prepare('INSERT INTO product_variants(product_id,attribute,value,extra_price) VALUES (?,?,?,?)');
const vOdoo = variant.run(crm, 'Brand', 'Odoo', 560).lastInsertRowid;
variant.run(crm, 'Brand', 'Brightloop', 0); variant.run(crm, 'Brand', 'Zoho', 340);
variant.run(sto, 'Region', 'EU', 0); variant.run(sto, 'Region', 'India', -50);

const plan = db.prepare('INSERT INTO plans(name,price,billing_period,min_qty,available_from,available_to,auto_close,allow_early_close,allow_pause,allow_renew) VALUES (?,?,?,?,?,?,?,?,?,?)');
const monthly = plan.run('Starter Monthly', 500, 'monthly', 1, '2025-01-01', null, 0, 1, 1, 1).lastInsertRowid;
const yearly = plan.run('Business Yearly', 5000, 'yearly', 3, '2025-01-01', null, 0, 0, 0, 1).lastInsertRowid;
const weekly = plan.run('Trial Weekly', 0, 'weekly', 1, '2025-01-01', null, 1, 1, 0, 0).lastInsertRowid;

const disc = db.prepare('INSERT INTO discounts(name,type,value,min_purchase,min_qty,start_date,end_date,usage_limit,applies_to) VALUES (?,?,?,?,?,?,?,?,?)');
const bulk = disc.run('Volume 10% (5+ seats)', 'percent', 10, 0, 5, '2025-01-01', '2027-12-31', null, 'product').lastInsertRowid;
db.prepare('INSERT INTO discount_products VALUES (?,?)').run(bulk, crm);
disc.run('Welcome 500 off', 'fixed', 500, 1000, 0, '2025-01-01', '2027-12-31', 50, 'subscription');

const tpl = db.prepare('INSERT INTO quotation_templates(name,plan_id,validity_days) VALUES (?,?,?)').run('Standard business bundle', yearly, 30).lastInsertRowid;
const tl = db.prepare('INSERT INTO quotation_template_lines(template_id,product_id,variant_id,qty) VALUES (?,?,?,?)');
tl.run(tpl, crm, vOdoo, 5); tl.run(tpl, sup, null, 1);

const first = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Isha', 'Vivaan', 'Anaya', 'Arjun', 'Sara', 'Neel', 'Tara'];
const biz = ['Studios', 'Traders', 'Labs', 'Foods', 'Logistics', 'Works', 'Retail', 'Digital', 'Clinic', 'Textiles'];
const cust = db.prepare('INSERT INTO customers(user_id,name,email,company,address,phone) VALUES (?,?,?,?,?,?)');
const ids = [];
db.transaction(() => {
  ids.push(cust.run(custUser, 'Casey Customer', 'customer@brightloop.test', 'Casey & Co', '12 MG Road, Bengaluru', '+91 98765 43210').lastInsertRowid);
  for (let i = 1; i < N_CUSTOMERS; i++) {
    const n = pick(first), b = pick(biz);
    ids.push(cust.run(null, `${n} ${pick(first)}`, `${n.toLowerCase()}${i}@example.com`, `${b} ${i}`, `${i} Market Street, Delhi`, '+91 90000 ' + String(10000 + i)).lastInsertRowid);
  }
})();

// subscriptions: spread starts over the last 5 months so billing has real history to chew on
const subIns = db.prepare(`INSERT INTO subscriptions(number,customer_id,plan_id,start_date,expiry_date,payment_terms,status,next_invoice_date) VALUES (?,?,?,?,?,?,?,?)`);
const lineIns = db.prepare('INSERT INTO subscription_lines(subscription_id,product_id,variant_id,qty,unit_price,tax_id) VALUES (?,?,?,?,?,?)');
const T = today();
db.transaction(() => {
  ids.forEach((cid, idx) => {
    const p = rnd() < 0.7 ? monthly : rnd() < 0.8 ? yearly : weekly;
    const start = addDays(T, -Math.floor(rnd() * 150));
    const r = rnd();
    const status = idx === 0 ? 'active' : r < 0.78 ? 'active' : r < 0.84 ? 'paused' : r < 0.9 ? 'closed' : r < 0.95 ? 'quotation' : 'draft';
    const sid = subIns.run(nextNumber('SUB'), cid, p, start, p === yearly ? addPeriod(start, 'yearly') : null, pick(['Net 15', 'Net 30', 'Immediate']), status, status === 'active' ? start : null).lastInsertRowid;
    lineIns.run(sid, crm, rnd() < 0.3 ? vOdoo : null, p === yearly ? 3 + Math.floor(rnd() * 8) : 1 + Math.floor(rnd() * 3), 1200, gst18);
    if (rnd() < 0.5) lineIns.run(sid, sup, null, 1, 500, gst18);
    if (rnd() < 0.3) lineIns.run(sid, sto, null, 1 + Math.floor(rnd() * 3), 250, gst5);
  });
})();
db.prepare(`UPDATE subscription_lines SET unit_price = 1760 WHERE variant_id = ?`).run(vOdoo); // 1200 + 560

// replay billing month by month so history looks real
const start = Date.now(); let created = 0;
for (let back = 150; back >= 0; back -= 7) { const r = runBilling({ asOf: addDays(T, -back) }); created += r.created; }
// confirm all but the newest week; pay ~70% of confirmed; the rest become overdue/outstanding
db.transaction(() => {
  db.prepare(`UPDATE invoices SET status='confirmed' WHERE issue_date < ?`).run(addDays(T, -7));
  const rows = db.prepare(`SELECT id, total, issue_date FROM invoices WHERE status='confirmed'`).all();
  const pay = db.prepare('INSERT INTO payments(invoice_id,method,amount,paid_on,note) VALUES (?,?,?,?,?)');
  const upd = db.prepare(`UPDATE invoices SET amount_paid=?, status=? WHERE id=?`);
  for (const r of rows) {
    const x = rnd(); if (x > 0.7) continue;
    const full = x < 0.6; const amt = full ? r.total : Math.round(r.total * 0.5 * 100) / 100;
    let on = addDays(r.issue_date, Math.floor(rnd() * 20)); if (on > T) on = T;
    pay.run(r.id, pick(['card', 'bank_transfer', 'upi', 'cheque', 'cash']), amt, on, full ? null : 'Part payment');
    upd.run(amt, full ? 'paid' : 'confirmed', r.id);
  }
})();
const c = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
console.log(`Seeded ${c('customers')} customers, ${c('subscriptions')} subscriptions, ${c('invoices')} invoices, ${c('payments')} payments in ${Date.now() - start}ms of billing`);
console.log('Logins (password Admin@1234): admin@brightloop.test | staff@brightloop.test | customer@brightloop.test');
