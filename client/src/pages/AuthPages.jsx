import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';
import { Field, Input, ErrorNote } from '../components/ui';
import { passwordChecks, passwordValid, emailValid } from '../validators';

function Shell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center"><div className="text-2xl font-semibold tracking-tight text-brand">Brightloop</div><p className="mt-1 text-sm text-muted">Subscriptions and billing</p></div>
        <div className="card p-6">
          <h1 className="text-xl font-semibold">{title}</h1>{subtitle && <p className="mb-4 mt-1 text-sm text-muted">{subtitle}</p>}
          <div className={subtitle ? '' : 'mt-4'}>{children}</div>
        </div>
        <div className="mt-4 text-center text-sm text-muted">{footer}</div>
      </div>
    </div>
  );
}
const PasswordChecklist = ({ value }) => (
  <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs" aria-label="Password rules">
    {passwordChecks(value).map((c) => <li key={c.label} className={c.ok ? 'text-ok' : 'text-muted'}>{c.ok ? '✓' : '○'} {c.label}</li>)}
  </ul>
);

export function Login() {
  const { login } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState(null); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); const v = {};
    if (!emailValid(f.email)) v.email = 'Enter a valid email address';
    if (!f.password) v.password = 'Enter your password';
    setFe(v); if (Object.keys(v).length) return;
    setBusy(true); setErr(null);
    try { await login(f.email.trim(), f.password); nav('/'); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <Shell title="Sign in" footer={<>New to Brightloop? <Link className="text-brand underline" to="/signup">Create an account</Link></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorNote error={err} />
        <Field label="Email" error={fe.email}><Input type="email" autoComplete="username" value={f.email} error={fe.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password" error={fe.password}><Input type="password" autoComplete="current-password" value={f.password} error={fe.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="text-center text-sm"><Link className="text-brand underline" to="/forgot-password">Forgot your password?</Link></div>
      </form>
    </Shell>
  );
}

export function Signup() {
  const { signup } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ name: '', company: '', email: '', password: '' }); const [err, setErr] = useState(null); const [fe, setFe] = useState({}); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); const v = {};
    if (f.name.trim().length < 2) v.name = 'Enter your name';
    if (!emailValid(f.email)) v.email = 'Enter a valid email address';
    if (!passwordValid(f.password)) v.password = 'Password does not meet the rules below';
    setFe(v); if (Object.keys(v).length) return;
    setBusy(true); setErr(null);
    try { await signup({ ...f, email: f.email.trim() }); nav('/'); } catch (x) { setErr(x); setFe(x.fields || {}); } finally { setBusy(false); }
  };
  return (
    <Shell title="Create your account" footer={<>Already have an account? <Link className="text-brand underline" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorNote error={err && !Object.keys(fe).length ? err : null} />
        <Field label="Full name" error={fe.name}><Input value={f.name} error={fe.name} autoComplete="name" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Company (optional)"><Input value={f.company} autoComplete="organization" onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <Field label="Email" error={fe.email}><Input type="email" autoComplete="email" value={f.email} error={fe.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <div><Field label="Password" error={fe.password}><Input type="password" autoComplete="new-password" value={f.password} error={fe.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field><PasswordChecklist value={f.password} /></div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); if (!emailValid(email)) return setErr({ message: 'Enter a valid email address' });
    setBusy(true); setErr(null);
    try { setMsg((await api.post('/auth/forgot-password', { email: email.trim() })).message); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <Shell title="Reset your password" subtitle="We will email a link to your registered address." footer={<Link className="text-brand underline" to="/login">Back to sign in</Link>}>
      {msg ? <p className="rounded bg-ok-soft p-3 text-sm text-ok" role="status">{msg}</p> : (
        <form onSubmit={submit} noValidate className="space-y-4"><ErrorNote error={err} />
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button></form>)}
    </Shell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams(); const nav = useNavigate();
  const [pw, setPw] = useState(''); const [err, setErr] = useState(null); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); if (!passwordValid(pw)) return setErr({ message: 'Password does not meet the rules below' });
    setBusy(true); setErr(null);
    try { await api.post('/auth/reset-password', { token: sp.get('token') || '', password: pw }); setDone(true); setTimeout(() => nav('/login'), 1800); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <Shell title="Choose a new password" footer={<Link className="text-brand underline" to="/login">Back to sign in</Link>}>
      {done ? <p className="rounded bg-ok-soft p-3 text-sm text-ok" role="status">Password updated. Taking you to sign in…</p> : (
        <form onSubmit={submit} noValidate className="space-y-4"><ErrorNote error={err} />
          <div><Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field><PasswordChecklist value={pw} /></div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button></form>)}
    </Shell>
  );
}