import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { PageHeader, Card, Table, Badge, Spinner, ErrorNote, useFetch, useToast } from '../components/ui';
import { money, dateFmt } from '../validators';

const STEPS = ['draft', 'quotation', 'confirmed', 'active', 'closed'];
// The one place where a sequence is real information: the subscription lifecycle.
function Stepper({ status }) {
  const idx = status === 'paused' ? STEPS.indexOf('active') : STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Subscription progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-1" aria-current={i === idx ? 'step' : undefined}>
          <span className={`rounded-full px-3 py-1 text-sm capitalize ${i === idx ? 'bg-brand font-medium text-white' : i < idx ? 'bg-brand-soft text-brand' : 'border border-line text-muted'}`}>{s === 'active' && status === 'paused' ? 'Paused' : s}</span>
          {i < STEPS.length - 1 && <span className={`h-px w-4 ${i < idx ? 'bg-brand' : 'bg-line'}`} />}
        </li>))}
    </ol>
  );
}

const ACTIONS = {
  draft: [['quotation', 'Send as quotation', 'btn-primary'], ['closed', 'Close', 'btn-danger']],
  quotation: [['confirmed', 'Confirm', 'btn-primary'], ['draft', 'Back to draft', 'btn-ghost'], ['closed', 'Close', 'btn-danger']],
  confirmed: [['active', 'Activate', 'btn-primary'], ['closed', 'Close', 'btn-danger']],
  active: [['paused', 'Pause', 'btn-ghost'], ['closed', 'Close', 'btn-danger']],
  paused: [['active', 'Resume', 'btn-primary'], ['closed', 'Close', 'btn-danger']],
  closed: [],
};

export default function SubscriptionDetail() {
  const { id } = useParams(); const toast = useToast();
  const { data: s, error, reload } = useFetch(`/subscriptions/${id}`);
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  if (error) return <ErrorNote error={error} />;
  if (!s) return <Spinner />;

  const run = async (fn, msg) => { setBusy(true); setErr(null); try { await fn(); toast(msg); reload(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  const go = (to, label) => {
    if (to === 'closed' && !window.confirm('Close this subscription? It will stop billing and cannot be reopened.')) return;
    run(() => api.post(`/subscriptions/${id}/transition`, { to }), `${label} done`);
  };
  const actions = ACTIONS[s.status].filter(([to]) => !(to === 'paused' && !s.allow_pause));
  const subtotal = s.lines.reduce((a, l) => a + l.amount, 0);
  const tax = s.lines.reduce((a, l) => a + (l.amount * (l.rate_pct || 0)) / 100, 0);

  return (
    <>
      <PageHeader title={s.number} subtitle={`${s.customer_name}${s.customer_company ? ' · ' + s.customer_company : ''}`}>
        {s.allow_renew && ['active', 'paused'].includes(s.status) && <button className="btn-ghost" disabled={busy} onClick={() => run(() => api.post(`/subscriptions/${id}/renew`), 'Renewed')}>Renew</button>}
        {actions.map(([to, label, cls]) => <button key={to} className={cls} disabled={busy} onClick={() => go(to, label)}>{label}</button>)}
      </PageHeader>
      <ErrorNote error={err} />
      <Card className="mb-6 p-4"><Stepper status={s.status} /></Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <h2 className="p-4 font-semibold">Lines</h2>
          <Table rows={s.lines} columns={[
            { key: 'product_name', label: 'Product', render: (l) => <>{l.product_name}{l.variant_value && <div className="text-xs text-muted">{l.attribute}: {l.variant_value}</div>}</> },
            { key: 'qty', label: 'Qty' }, { key: 'unit_price', label: 'Unit price', render: (l) => money(l.unit_price) },
            { key: 'tax_name', label: 'Tax', render: (l) => l.tax_name || '—' }, { key: 'amount', label: 'Amount', align: 'right', render: (l) => money(l.amount) }]} />
          <div className="space-y-1 border-t border-line p-4 text-right text-sm">
            <div className="text-muted">Lines {money(subtotal)} · Tax {money(tax)} · Plan fee {money(s.recurring_amount - subtotal)}</div>
            <div className="text-base font-semibold">Each billing period: {money(s.recurring_amount + tax)}</div>
          </div>
        </Card>
        <Card className="h-fit space-y-3 p-5 text-sm">
          {[['Status', <Badge status={s.status} />], ['Plan', `${s.plan_name} (${s.billing_period})`], ['Start date', dateFmt(s.start_date)], ['Expiry date', dateFmt(s.expiry_date)], ['Next invoice', dateFmt(s.next_invoice_date)],
            ['Payment terms', s.payment_terms], ...(s.quote_valid_until ? [['Quote valid until', dateFmt(s.quote_valid_until)]] : [])].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></div>))}
          <Link to={`/invoices?q=${encodeURIComponent(s.customer_name)}`} className="block pt-2 text-brand underline">View this customer's invoices</Link>
        </Card>
      </div>
    </>
  );
}