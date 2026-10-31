const jwt = require('jsonwebtoken');
const { z } = require('zod');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

// Wrap async/sync handlers so thrown errors reach the error middleware.
const wrap = (fn) => (req, res, next) => { try { Promise.resolve(fn(req, res, next)).catch(next); } catch (e) { next(e); } };

// Validate req.body / req.query with a zod schema; replaces them with the parsed value.
const validate = (schema, where = 'body') => (req, _res, next) => {
  const r = schema.safeParse(req[where]);
  if (!r.success) {
    const fields = {};
    for (const i of r.error.issues) fields[i.path.join('.') || '_'] ??= i.message;
    return next(new HttpError(422, 'Validation failed', fields));
  }
  // Express 5 makes req.query a read-only getter, so redefine it instead of assigning
  Object.defineProperty(req, where, { value: r.data, writable: true, configurable: true, enumerable: true });
  next();
};

const signToken = (u) => jwt.sign({ id: u.id, role: u.role }, JWT_SECRET, { expiresIn: '12h' });

const auth = (req, _res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return next(new HttpError(401, 'Sign in to continue'));
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { next(new HttpError(401, 'Session expired, sign in again')); }
};

const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'You do not have access to this'));

const errorHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, fields: err.details });
  if (err && err.code && String(err.code).startsWith('SQLITE_CONSTRAINT')) {
    const msg = err.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'That value already exists'
      : err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ? 'This record is linked to other data'
      : 'Value rejected by database rules';
    return res.status(409).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
};

// ---- dates (all stored as YYYY-MM-DD, UTC-safe) ----
const today = () => new Date().toISOString().slice(0, 10);
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function addPeriod(iso, period) {
  const d = new Date(iso + 'T00:00:00Z');
  if (period === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (period === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (period === 'monthly') {
    const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  } else if (period === 'yearly') {
    const day = d.getUTCDate(), m = d.getUTCMonth(); d.setUTCDate(1); d.setUTCFullYear(d.getUTCFullYear() + 1);
    const last = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate(); d.setUTCMonth(m); d.setUTCDate(Math.min(day, last));
  }
  return d.toISOString().slice(0, 10);
}
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- shared zod pieces ----
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const password = z.string()
  .min(9, 'Use more than 8 characters')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[^A-Za-z0-9]/, 'Add a special character');
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

// pagination helper: ?page=1&pageSize=20
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.string().trim().max(20).optional(),
});

module.exports = { HttpError, wrap, validate, signToken, auth, requireRole, errorHandler,
  today, addDays, addPeriod, round2, z, isoDate, password, email, pageQuery };
