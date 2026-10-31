import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { PageHeader, Card, Modal, Field, Input, Select, Textarea, ErrorNote, Spinner, useFetch, useToast } from '../components/ui';
import { InvoiceBadge } from './Invoices';
import { money, dateFmt, isoToday, methodLabel } from '../validators';

function PaymentModal({ inv, onClose, onDone }) {
  const [f, setF] = useState({ method: 'bank_transfer', amount: inv.balance, paid_on: isoToday(), note: '' });
  const [fe, setFe] = useState({}); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); const v = {}; const a = Number(f.amount);
    if (!(a > 0)) v.amount = 'Amount must be greater than 0'; else if (a > inv.balance + 0.001) v.amount = `Maximum is ${money(inv.balance)}`;
    if (!f.paid_on) v.paid_on = 'Choose the payment date';
    setFe(v); if (Object.keys(v).length) return;
    setBusy(true); setErr(null);
    try { await api.post(`/invoices/${inv.id}/payments`, { ...f, amount: a, note: f.note || null }); onDone(); } catch (x) { setErr(x); setFe(x.fields || {}); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Record payment for ${inv.number}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorNote error={err && !Object.keys(fe).length ? err : null} />
        <p className="text-sm text-muted">Balance due: <span className="font-medium text-ink">{money(inv.balance)}</span></p>
        <Field label="Method"><Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{[['bank_transfer', 'Bank transfer'], ['card', 'Card'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['cash', 'Cash']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount" error={fe.amount}><Input type="number" step="0.01" min="0" error={fe.amount} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Date" error={fe.paid_on}><Input type="date" error={fe.paid_on} value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Field>
        </div>
        <Field label="Note (optional)"><Textarea maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button></div>
      </form>
    </Modal>
  );
}

export default function InvoiceDetail({ portal = false }) {
  const { id } = useParams(); const toast = useToast();
  const { data: inv, error, reload } = useFetch(portal ? `/me/invoices/${id}` : `/invoices/${id}`);
  const [pay, setPay] = useState(false); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  if (error) return <ErrorNote error={error} />;
  if (!inv) return <Spinner />;

  const act = async (path, msg) => { setBusy(true); setErr(null); try { await api.post(`/invoices/${id}/${path}`); toast(msg); reload(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const canPay = inv.status === 'confirmed';

  return (
    <>
      <PageHeader title={inv.number} subtitle={<Link to={portal ? '/my/invoices' : '/invoices'} className="text-brand underline">← All invoices</Link>}>
        {!portal && inv.status === 'draft' && <button className="btn-primary" disabled={busy} onClick={() => act('confirm', 'Invoice confirmed')}>Confirm</button>}
        {!portal && inv.status === 'confirmed' && <button className="btn-ghost" disabled={busy} onClick={() => act('send', 'Invoice sent to customer')}>{inv.sent_at ? 'Send again' : 'Send'}</button>}
        {!portal && canPay && <button className="btn-primary" onClick={() => setPay(true)}>Record payment</button>}
        {!portal && ['draft', 'confirmed'].includes(inv.status) && inv.amount_paid === 0 && <button className="btn-danger" disabled={busy} onClick={() => window.confirm('Cancel this invoice?') && act('cancel', 'Invoice cancelled')}>Cancel invoice</button>}
        <button className="btn-ghost" onClick={() => window.print()}>Print</button>
      </PageHeader>
      <ErrorNote error={err} />

      <Card className="print-sheet mx-auto max-w-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="text-xl font-semibold text-brand">Brightloop Software</div><div className="text-sm text-muted">Subscriptions and billing</div></div>
          <div className="text-right"><div className="text-lg font-semibold">Invoice {inv.number}</div><div className="mt-1"><InvoiceBadge r={inv} /></div>{inv.sent_at && <div className="mt-1 text-xs text-muted">Sent {dateFmt(inv.sent_at.slice(0, 10))}</div>}</div>
        </div>
        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div><div className="text-muted">Billed to</div><div className="font-medium">{inv.customer.name}</div>{inv.customer.company && <div>{inv.customer.company}</div>}{inv.customer.address && <div>{inv.customer.address}</div>}{inv.customer.email && <div>{inv.customer.email}</div>}</div>
          <div className="sm:text-right"><div><span className="text-muted">Issued </span>{dateFmt(inv.issue_date)}</div><div><span className="text-muted">Due </span><span className={inv.overdue ? 'font-medium text-bad' : ''}>{dateFmt(inv.due_date)}</span></div><div><span className="text-muted">Period </span>{dateFmt(inv.period_start)} – {dateFmt(inv.period_end)}</div><div><span className="text-muted">Subscription </span>{inv.subscription_number}</div></div>
        </div>
        <div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-muted"><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium">Qty</th><th className="py-2 text-right font-medium">Unit price</th><th className="py-2 text-right font-medium">Tax</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody>{inv.lines.map((l) => <tr key={l.id} className="border-b border-line"><td className="py-2 pr-2">{l.description}</td><td className="py-2 text-right">{l.qty}</td><td className="py-2 text-right">{money(l.unit_price)}</td><td className="py-2 text-right">{money(l.tax_amount)}</td><td className="py-2 text-right">{money(l.amount)}</td></tr>)}</tbody></table></div>
        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{money(inv.subtotal)}</span></div>
          {inv.discount_total > 0 && <div className="flex justify-between"><span className="text-muted">Discounts</span><span>−{money(inv.discount_total)}</span></div>}
          <div className="flex justify-between"><span className="text-muted">Tax</span><span>{money(inv.tax_total)}</span></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span><span>{money(inv.total)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Paid</span><span>{money(inv.amount_paid)}</span></div>
          <div className="flex justify-between font-semibold"><span>Balance due</span><span>{money(inv.balance)}</span></div>
        </div>
        {inv.payments.length > 0 && (
          <div className="mt-6"><h2 className="mb-2 font-semibold">Payments</h2>
            <ul className="divide-y divide-line text-sm">{inv.payments.map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{dateFmt(p.paid_on)} · <span>{methodLabel(p.method)}</span>{p.note && <span className="text-muted"> · {p.note}</span>}</span><span className="font-medium">{money(p.amount)}</span></li>)}</ul></div>)}
      </Card>
      {pay && <PaymentModal inv={inv} onClose={() => setPay(false)} onDone={() => { setPay(false); toast('Payment recorded'); reload(); }} />}
    </>
  );
}