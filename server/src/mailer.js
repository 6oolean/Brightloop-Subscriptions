// Offline-first mail: by default write emails to ./outbox and the console.
// Set SMTP_URL to deliver through a real server instead.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const outDir = path.join(__dirname, '..', 'outbox');
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

async function sendMail({ to, subject, text }) {
  if (transport) return transport.sendMail({ from: process.env.MAIL_FROM || 'billing@brightloop.local', to, subject, text });
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${Date.now()}-${to.replace(/[^a-z0-9@.]/gi, '_')}.txt`);
  fs.writeFileSync(file, `To: ${to}\nSubject: ${subject}\n\n${text}\n`);
  console.log(`[mail] ${subject} -> ${to} (saved ${path.relative(process.cwd(), file)})\n${text}`);
}
module.exports = { sendMail };
