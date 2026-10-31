PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','staff','customer')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_resets_hash ON password_resets(token_hash);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  address TEXT,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('service','software','addon','physical')),
  sales_price REAL NOT NULL CHECK (sales_price >= 0),
  cost_price REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  extra_price REAL NOT NULL DEFAULT 0,
  UNIQUE(product_id, attribute, value)
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  billing_period TEXT NOT NULL CHECK (billing_period IN ('daily','weekly','monthly','yearly')),
  min_qty INTEGER NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
  available_from TEXT,
  available_to TEXT,
  auto_close INTEGER NOT NULL DEFAULT 0,
  allow_early_close INTEGER NOT NULL DEFAULT 1,
  allow_pause INTEGER NOT NULL DEFAULT 1,
  allow_renew INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS taxes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  rate_pct REAL NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fixed','percent')),
  value REAL NOT NULL CHECK (value > 0),
  min_purchase REAL NOT NULL DEFAULT 0,
  min_qty INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  usage_limit INTEGER,
  times_used INTEGER NOT NULL DEFAULT 0,
  applies_to TEXT NOT NULL CHECK (applies_to IN ('product','subscription')),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS discount_products (
  discount_id INTEGER NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (discount_id, product_id)
);

CREATE TABLE IF NOT EXISTS quotation_templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days > 0)
);
CREATE TABLE IF NOT EXISTS quotation_template_lines (
  id INTEGER PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id),
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  start_date TEXT NOT NULL,
  expiry_date TEXT,
  payment_terms TEXT NOT NULL DEFAULT 'Net 15',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','quotation','confirmed','active','paused','closed')),
  next_invoice_date TEXT,
  discount_id INTEGER REFERENCES discounts(id),
  quote_valid_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sub_status_next ON subscriptions(status, next_invoice_date);
CREATE INDEX IF NOT EXISTS idx_sub_customer ON subscriptions(customer_id);

CREATE TABLE IF NOT EXISTS subscription_lines (
  id INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  tax_id INTEGER REFERENCES taxes(id)
);
CREATE INDEX IF NOT EXISTS idx_subline_sub ON subscription_lines(subscription_id);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  subtotal REAL NOT NULL,
  tax_total REAL NOT NULL,
  discount_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','paid','cancelled')),
  sent_at TEXT,
  UNIQUE(subscription_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_inv_status_due ON invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_inv_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_inv_issue ON invoices(issue_date);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  tax_amount REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invline_inv ON invoice_lines(invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  method TEXT NOT NULL CHECK (method IN ('card','bank_transfer','cash','upi','cheque')),
  amount REAL NOT NULL CHECK (amount > 0),
  paid_on TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_pay_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pay_date ON payments(paid_on);

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
