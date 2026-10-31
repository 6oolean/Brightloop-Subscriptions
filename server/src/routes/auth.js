const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db');
const { sendMail } = require('../mailer');
const { wrap, validate, signToken, auth, requireRole, HttpError, z, password, email } = require('../util');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

router.post('/signup', validate(z.object({
  name: z.string().trim().min(2, 'Enter your name').max(100),
  company: z.string().trim().max(100).optional(),
  email, password,
})), wrap((req, res) => {
  const { name, company, email, password } = req.body;
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    throw new HttpError(409, 'An account with this email already exists', { email: 'Already registered' });
  const hash = bcrypt.hashSync(password, 10);
  const user = db.transaction(() => {
    const id = db.prepare(`INSERT INTO users(email,password_hash,role,name) VALUES (?,?, 'customer', ?)`).run(email, hash, name).lastInsertRowid;
    db.prepare('INSERT INTO customers(user_id,name,email,company) VALUES (?,?,?,?)').run(id, name, email, company || null);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  })();
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/login', validate(z.object({ email, password: z.string().min(1, 'Enter your password') })), wrap((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email);
  // same message for unknown email and wrong password: no account enumeration
  if (!u || !bcrypt.compareSync(req.body.password, u.password_hash)) throw new HttpError(401, 'Email or password is incorrect');
  res.json({ token: signToken(u), user: publicUser(u) });
}));

router.get('/me', auth, wrap((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!u) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: publicUser(u) });
}));

router.post('/forgot-password', validate(z.object({ email })), wrap(async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email);
  if (u) {
    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?').run(u.id);
    db.prepare('INSERT INTO password_resets(user_id, token_hash, expires_at) VALUES (?,?,?)').run(u.id, sha(token), exp);
    const base = process.env.APP_URL || 'http://localhost:5173';
    await sendMail({ to: u.email, subject: 'Reset your Brightloop password',
      text: `Hi ${u.name},\n\nUse this link within 30 minutes to set a new password:\n${base}/reset-password?token=${token}\n\nIf you did not ask for this, ignore this email.` });
  }
  // identical response either way
  res.json({ message: 'If that email is registered, a reset link is on its way.' });
}));

router.post('/reset-password', validate(z.object({ token: z.string().min(10), password })), wrap((req, res) => {
  const r = db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used = 0').get(sha(req.body.token));
  if (!r || new Date(r.expires_at) < new Date()) throw new HttpError(400, 'This reset link is invalid or has expired');
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(req.body.password, 10), r.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(r.id);
  })();
  res.json({ message: 'Password updated. You can sign in now.' });
}));

// Admin-only: create staff
router.post('/staff', auth, requireRole('admin'), validate(z.object({
  name: z.string().trim().min(2).max(100), email, password,
})), wrap((req, res) => {
  const { name, email, password } = req.body;
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with this email already exists', { email: 'Already registered' });
  const id = db.prepare(`INSERT INTO users(email,password_hash,role,name) VALUES (?,?, 'staff', ?)`).run(email, bcrypt.hashSync(password, 10), name).lastInsertRowid;
  res.status(201).json({ id, name, email, role: 'staff' });
}));
router.get('/staff', auth, requireRole('admin'), wrap((_req, res) =>
  res.json(db.prepare(`SELECT id,name,email,role,created_at FROM users WHERE role IN ('admin','staff') ORDER BY id`).all())));

module.exports = router;