const router = require('express').Router();
const { db } = require('../db');
const { wrap, validate, auth, requireRole, HttpError, z, isoDate, pageQuery } = require('../util');

router.use(auth);
const staffRead = requireRole('admin', 'staff');
const adminOnly = requireRole('admin');
const num = (label, min = 0) => z.coerce.number({ invalid_type_error: `${label} must be a number` }).min(min, `${label} cannot be below ${min}`);
const bool = z.union([z.boolean(), z.number()]).transform((v) => (v ? 1 : 0));
const idParam = (req) => { const id = Number(req.params.id); if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id'); return id; };

// Small helper: builds list/get/create/update/delete for a simple table.
// `cols` is the whitelist of writable columns, so request bodies can never touch other fields.
function crud(path, table, schema, cols, { orderBy = 'id DESC', canDelete = true, read = staffRead, write = adminOnly } = {}) {
  router.get(path, read, wrap((_req, res) => res.json(db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all())));
  router.get(`${path}/:id`, read, wrap((req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(idParam(req));
    if (!row) throw new HttpError(404, 'Not found');
    res.json(row);
  }));
  router.post(path, write, validate(schema), wrap((req, res) => {
    const keys = cols.filter((c) => req.body[c] !== undefined);
    const id = db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => req.body[k])).lastInsertRowid;
    res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  }));
  router.put(`${path}/:id`, write, validate(schema), wrap((req, res) => {
    const id = idParam(req);
    const keys = cols.filter((c) => req.body[c] !== undefined);
    const r = db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ?`).run(...keys.map((k) => req.body[k]), id);
    if (!r.changes) throw new HttpError(404, 'Not found');
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  }));
  if (canDelete) router.delete(`${path}/:id`, write, wrap((req, res) => {
    const r = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(idParam(req));
    if (!r.changes) throw new HttpError(404, 'Not found');
    res.status(204).end();
  }));
}

// ---- products ----
const productSchema = z.object({
  name: z.string().trim().min(2, 'Enter a product name').max(120),
  type: z.enum(['service', 'software', 'addon', 'physical'], { message: 'Pick a product type' }),
  sales_price: num('Sales price'), cost_price: num('Cost price').default(0),
  notes: z.string().trim().max(1000).optional().nullable(), active: bool.optional(),
});
crud('/products', 'products', productSchema, ['name', 'type', 'sales_price', 'cost_price', 'notes', 'active'], { canDelete: false });

// variants: e.g. attribute "Brand", value "Odoo", extra_price 560
router.get('/products/:id/variants', staffRead, wrap((req, res) =>
  res.json(db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id').all(idParam(req)))));
router.post('/products/:id/variants', adminOnly, validate(z.object({
  attribute: z.string().trim().min(1, 'Enter an attribute, e.g. Brand').max(60),
  value: z.string().trim().min(1, 'Enter a value, e.g. Odoo').max(60),
  extra_price: num('Extra price', -1e9).default(0),
})), wrap((req, res) => {
  const pid = idParam(req);
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(pid)) throw new HttpError(404, 'Product not found');
  const id = db.prepare('INSERT INTO product_variants(product_id,attribute,value,extra_price) VALUES (?,?,?,?)').run(pid, req.body.attribute, req.body.value, req.body.extra_price).lastInsertRowid;
  res.status(201).json(db.prepare('SELECT * FROM product_variants WHERE id = ?').get(id));
}));
router.delete('/variants/:id', adminOnly, wrap((req, res) => {
  db.prepare('DELETE FROM product_variants WHERE id = ?').run(idParam(req)); res.status(204).end();
}));
router.get('/variants', staffRead, wrap((_req, res) => res.json(db.prepare(
  `SELECT v.*, p.name AS product_name FROM product_variants v JOIN products p ON p.id = v.product_id ORDER BY p.name, v.id`).all())));

// ---- plans ----
const planSchema = z.object({
  name: z.string().trim().min(2, 'Enter a plan name').max(120),
  price: num('Price'),
  billing_period: z.enum(['daily', 'weekly', 'monthly', 'yearly'], { message: 'Pick a billing period' }),
  min_qty: z.coerce.number().int('Whole number only').min(1, 'At least 1').default(1),
  available_from: isoDate.optional().nullable(), available_to: isoDate.optional().nullable(),
  auto_close: bool.optional(), allow_early_close: bool.optional(), allow_pause: bool.optional(), allow_renew: bool.optional(),
}).refine((p) => !p.available_from || !p.available_to || p.available_to >= p.available_from,
  { message: 'End date must be on or after the start date', path: ['available_to'] });
crud('/plans', 'plans', planSchema, ['name', 'price', 'billing_period', 'min_qty', 'available_from', 'available_to', 'auto_close', 'allow_early_close', 'allow_pause', 'allow_renew'], { canDelete: false });

// ---- taxes ----
crud('/taxes', 'taxes', z.object({
  name: z.string().trim().min(2, 'Enter a tax name').max(60),
  rate_pct: num('Rate').max(100, 'Rate cannot exceed 100%'), active: bool.optional(),
}), ['name', 'rate_pct', 'active'], { canDelete: false });

// ---- discounts (admin only to create, per the brief) ----
const discountSchema = z.object({
  name: z.string().trim().min(2, 'Enter a discount name').max(80),
  type: z.enum(['fixed', 'percent'], { message: 'Pick fixed or percentage' }),
  value: num('Value', 0.01),
  min_purchase: num('Minimum purchase').default(0),
  min_qty: z.coerce.number().int().min(0).default(0),
  start_date: isoDate, end_date: isoDate,
  usage_limit: z.coerce.number().int().min(1, 'Limit must be at least 1').optional().nullable(),
  applies_to: z.enum(['product', 'subscription'], { message: 'Pick what it applies to' }),
  active: bool.optional(),
  product_ids: z.array(z.number().int()).optional(),
}).refine((d) => d.end_date >= d.start_date, { message: 'End date must be on or after the start date', path: ['end_date'] })
  .refine((d) => d.type !== 'percent' || d.value <= 100, { message: 'A percentage cannot exceed 100', path: ['value'] })
  .refine((d) => d.applies_to !== 'product' || (d.product_ids && d.product_ids.length), { message: 'Choose at least one product', path: ['product_ids'] });
const discCols = ['name', 'type', 'value', 'min_purchase', 'min_qty', 'start_date', 'end_date', 'usage_limit', 'applies_to', 'active'];
const withProducts = (d) => ({ ...d, product_ids: db.prepare('SELECT product_id FROM discount_products WHERE discount_id = ?').all(d.id).map((r) => r.product_id) });
const saveDiscount = db.transaction((id, b) => {
  const keys = discCols.filter((c) => b[c] !== undefined);
  if (id == null) id = db.prepare(`INSERT INTO discounts(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => b[k])).lastInsertRowid;
  else db.prepare(`UPDATE discounts SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id = ?`).run(...keys.map((k) => b[k]), id);
  db.prepare('DELETE FROM discount_products WHERE discount_id = ?').run(id);
  if (b.applies_to === 'product') for (const p of b.product_ids) db.prepare('INSERT INTO discount_products VALUES (?,?)').run(id, p);
  return id;
});
router.get('/discounts', staffRead, wrap((_req, res) => res.json(db.prepare('SELECT * FROM discounts ORDER BY id DESC').all().map(withProducts))));
router.post('/discounts', adminOnly, validate(discountSchema), wrap((req, res) => {
  const id = saveDiscount(null, req.body); res.status(201).json(withProducts(db.prepare('SELECT * FROM discounts WHERE id = ?').get(id)));
}));
router.put('/discounts/:id', adminOnly, validate(discountSchema), wrap((req, res) => {
  const id = idParam(req);
  if (!db.prepare('SELECT 1 FROM discounts WHERE id = ?').get(id)) throw new HttpError(404, 'Not found');
  saveDiscount(id, req.body); res.json(withProducts(db.prepare('SELECT * FROM discounts WHERE id = ?').get(id)));
}));

// ---- customers (staff can manage; paginated + searchable) ----
const customerSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional().nullable().or(z.literal('')),
  company: z.string().trim().max(100).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  phone: z.string().trim().regex(/^[0-9+()\-\s]{6,20}$/, 'Enter a valid phone number').optional().nullable().or(z.literal('')),
});
router.get('/customers', staffRead, validate(pageQuery, 'query'), wrap((req, res) => {
  const { page, pageSize, q } = req.query;
  const like = `%${q || ''}%`;
  const total = db.prepare('SELECT COUNT(*) c FROM customers WHERE name LIKE ? OR company LIKE ? OR email LIKE ?').get(like, like, like).c;
  const rows = db.prepare('SELECT * FROM customers WHERE name LIKE ? OR company LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?').all(like, like, like, pageSize, (page - 1) * pageSize);
  res.json({ rows, total, page, pageSize });
}));
router.post('/customers', staffRead, validate(customerSchema), wrap((req, res) => {
  const b = req.body;
  const id = db.prepare('INSERT INTO customers(name,email,company,address,phone) VALUES (?,?,?,?,?)').run(b.name, b.email || null, b.company || null, b.address || null, b.phone || null).lastInsertRowid;
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
}));
router.put('/customers/:id', staffRead, validate(customerSchema), wrap((req, res) => {
  const b = req.body, id = idParam(req);
  const r = db.prepare('UPDATE customers SET name=?,email=?,company=?,address=?,phone=? WHERE id=?').run(b.name, b.email || null, b.company || null, b.address || null, b.phone || null, id);
  if (!r.changes) throw new HttpError(404, 'Not found');
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
}));

module.exports = router;