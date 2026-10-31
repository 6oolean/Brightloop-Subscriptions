// Mirrors the server's zod rules so people see problems as they type. The server still re-checks everything.
export const passwordChecks = (pw) => [
  { ok: pw.length > 8, label: 'More than 8 characters' },
  { ok: /[A-Z]/.test(pw), label: 'An uppercase letter' },
  { ok: /[a-z]/.test(pw), label: 'A lowercase letter' },
  { ok: /[^A-Za-z0-9]/.test(pw), label: 'A special character' },
];
export const passwordValid = (pw) => passwordChecks(pw).every((c) => c.ok);
export const emailValid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

export const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
export const dateFmt = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const isoToday = () => new Date().toISOString().slice(0, 10);

export const methodLabel = (m) => ({ bank_transfer: 'Bank transfer', card: 'Card', upi: 'UPI', cheque: 'Cheque', cash: 'Cash' }[m] || m);