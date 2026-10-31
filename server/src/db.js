const { DatabaseSync } = require('node:sqlite'); // built into Node 22+, nothing to compile
const fs = require('fs');
const path = require('path');

const file = process.env.DB_FILE || path.join(__dirname, '..', 'brightloop.db');
const raw = new DatabaseSync(file);

// Small wrapper so the rest of the code can keep using db.prepare / db.exec / db.pragma / db.transaction
let depth = 0;
const db = {
  exec: (sql) => raw.exec(sql),
  // node:sqlite rejects named parameters the SQL doesn't use; better-sqlite3 ignored them. Drop the extras.
  prepare: (sql) => {
    const stmt = raw.prepare(sql);
    const used = new Set([...sql.matchAll(/[@:$](\w+)/g)].map((m) => m[1]));
    const clean = (args) => args.map((a) =>
      a && typeof a === 'object' && !Array.isArray(a) && !Buffer.isBuffer(a)
        ? Object.fromEntries(Object.entries(a).filter(([key]) => used.has(key)))
        : a);
    return {
      run: (...args) => stmt.run(...clean(args)),
      get: (...args) => stmt.get(...clean(args)),
      all: (...args) => stmt.all(...clean(args)),
    };
  },
  pragma: (setting) => raw.exec(`PRAGMA ${setting}`),
  // Same behaviour as better-sqlite3: BEGIN/COMMIT at the top level, SAVEPOINT when nested
  transaction: (fn) => (...args) => {
    const name = `sp_${depth}`;
    raw.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`);
    depth++;
    try {
      const result = fn(...args);
      depth--;
      raw.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
      return result;
    } catch (err) {
      depth--;
      raw.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
      throw err;
    }
  }
};
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Gap-free per-prefix sequence (SUB-00001, INV-00001). Safe because SQLite
// serialises writers and this is always called inside the caller's transaction.
const nextStmt = db.prepare(
  `INSERT INTO counters(name, value) VALUES (?, 1)
   ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value`
);
function nextNumber(prefix) {
  const { value } = nextStmt.get(prefix);
  return `${prefix}-${String(value).padStart(5, '0')}`;
}

module.exports = { db, nextNumber };
