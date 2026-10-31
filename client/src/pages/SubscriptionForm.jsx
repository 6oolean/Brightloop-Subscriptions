import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { PageHeader, Card, Field, Input, Select, ErrorNote, Spinner, useFetch, useToast } from '../components/ui';
import { money, isoToday } from '../validators';

const blankLine = () => ({ product_id: '', variant_id: '', qty: 1, tax_id: '' });

function CustomerPicker({ value, onChange, error }) {
  const [q, setQ] = useState(''); const [opts, setOpts] = useState([]); const [label, setLabel] = useState('');
  useEffect(() => { const h = setTimeout(() => api.get('/customers', { q, pageSize: 8 }).then((r) => setOpts(r.rows)).catch(() => setOpts([])), 200); return () => clearTimeout(h); }, [q]);
  return (
    <Field label="Customer" error={error} hint={value ? `Selected: ${label}` : 'Type to search by name, company or email'}>
      <Input value={q} error={error} placeholder="Search customers" onChange={(e) => setQ(e.target.value)} />
      {opts.length > 0 && <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-line bg-surface text-sm">{opts.map((c) => (
        <li key={c.id}><button type="button" onClick={() => { onChange(c.id); setLabel(c.name + (c.company ? ` (${c.company})` : '')); }} className={`block w-full px-3 py-1.5 text-left hover:bg-paper ${c.id === value ? 'bg-brand-soft font-medium' : ''}`}>{c.name}{c.company ? ` · ${c.company}` : ''}</button></li>))}</ul>}
    </Field>
  );
}

export default function SubscriptionForm() {
  const nav = useNavigate(); const toast = useToast();
  const plans = useFetch('/plans'), products = useFetch('/products'), variants = useFetch('/variants'), taxes = useFetch('/taxes'), templates = useFetch('/quotation-templates'), discounts = useFetch('/discounts');
  const [f, setF] = useState({ customer_id: null, plan_id: '', template_id: '', start_date: isoToday(), expiry_date: '', payment_terms: 'Net 15', discount_id: '' });
  const [lines, setLines] = useState([blankLine()]);
  const [fe, setFe] = useState({}); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);

  if (!plans.data || !products.data || !variants.data || !taxes.data || !templates.data || !discounts.data) return <Spinner />;
  const P = (id) => products.data.find((p) => p.id === Number(id)), V = (id) => variants.data.find((v) => v.id === Number(id)), T = (id) => taxes.data.find((t) => t.id === Number(id));
  const plan = plans.data.find((p) => p.id === Number(f.plan_id));
  const unit = (l) => (P(l.product_id)?.sales_price || 0) + (V(l.variant_id)?.extra_price || 0);
  const subtotal = lines.reduce((s, l) => s + unit(l) * (Number(l.qty) || 0), 0);
  const tax = lines.reduce((s, l) => s + (unit(l) * (Number(l.qty) || 0) * (T(l.tax_id)?.rate_pct || 0)) / 100, 0);
  const planFee = plan?.price || 0;

  const applyTemplate = (id) => {
    const t = templates.data.find((x) => x.id === Number(id));
    setF((p) => ({ ...p, template_id: id, plan_id: t ? t.plan_id : p.plan_id }));
    if (t) setLines(t.lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id || '', qty: l.qty, tax_id: '' })));
  };
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async (e) => {
    e.preventDefault(); const v = {};
    if (!f.customer_id) v.customer_id = 'Pick a customer';
    if (!f.plan_id) v.plan_id = 'Pick a plan';
    if (!f.start_date) v.start_date = 'Choose a start date';
    if (f.expiry_date && f.expiry_date <= f.start_date) v.expiry_date = 'Expiry must be after the start date';
    if (lines.some((l) => !l.product_id)) v.lines = 'Choose a product on every line';
    else if (lines.some((l) => !Number.isInteger(Number(l.qty)) || Number(l.qty) < 1)) v.lines = 'Quantities must be whole numbers of at least 1';
    else if (plan && lines.reduce((s, l) => s + Number(l.qty), 0) < plan.min_qty) v.lines = `This plan needs a minimum quantity of ${plan.min_qty}`;
    setFe(v); if (Object.keys(v).length) return;
    setBusy(true); setErr(null);
    try {
      const body = { customer_id: f.customer_id, plan_id: Number(f.plan_id), start_date: f.start_date, expiry_date: f.expiry_date || null, payment_terms: f.payment_terms,
        discount_id: f.discount_id ? Number(f.discount_id) : null, template_id: f.template_id ? Number(f.template_id) : undefined,
        lines: lines.map((l) => ({ product_id: Number(l.product_id), variant_id: l.variant_id ? Number(l.variant_id) : null, qty: Number(l.qty), tax_id: l.tax_id ? Number(l.tax_id) : null })) };
      const s = await api.post('/subscriptions', body); toast(`${s.number} created`); nav(`/subscriptions/${s.id}`);
    } catch (x) { setErr(x); setFe(x.fields || {}); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader title="New subscription" subtitle="Start from a template or build the lines yourself."><button type="button" className="btn-ghost" onClick={() => nav(-1)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Create subscription'}</button></PageHeader>
      <ErrorNote error={err && !Object.keys(fe).length ? err : null} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><CustomerPicker value={f.customer_id} onChange={(id) => setF({ ...f, customer_id: id })} error={fe.customer_id} /></div>
            <Field label="Quotation template (optional)"><Select value={f.template_id} onChange={(e) => applyTemplate(e.target.value)}><option value="">Start from scratch</option>{templates.data.map((t) => <option key={t.id} value={t.id}>{t.name} · valid {t.validity_days} days</option>)}</Select></Field>
            <Field label="Plan" error={fe.plan_id}><Select error={fe.plan_id} value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })}><option value="">Select a plan</option>{plans.data.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)} {p.billing_period}</option>)}</Select></Field>
            <Field label="Start date" error={fe.start_date}><Input type="date" error={fe.start_date} value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
            <Field label="Expiry date (optional)" error={fe.expiry_date}><Input type="date" error={fe.expiry_date} value={f.expiry_date} min={f.start_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} /></Field>
            <Field label="Payment terms"><Select value={f.payment_terms} onChange={(e) => setF({ ...f, payment_terms: e.target.value })}>{['Immediate', 'Net 7', 'Net 15', 'Net 30', 'Net 45'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Discount (optional)" hint="Product discounts apply on their own"><Select value={f.discount_id} onChange={(e) => setF({ ...f, discount_id: e.target.value })}><option value="">None</option>{discounts.data.filter((d) => d.applies_to === 'subscription' && d.active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Lines</h2>
            {fe.lines && <p role="alert" className="mb-3 text-sm text-bad">{fe.lines}</p>}
            <div className="space-y-4">
              {lines.map((l, i) => {
                const vs = variants.data.filter((v) => v.product_id === Number(l.product_id));
                return (
                  <div key={i} className="grid gap-3 rounded border border-line p-3 sm:grid-cols-[2fr_1.4fr_80px_1fr_auto]">
                    <Field label="Product"><Select value={l.product_id} onChange={(e) => setLine(i, { product_id: e.target.value, variant_id: '' })}><option value="">Select</option>{products.data.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.sales_price)}</option>)}</Select></Field>
                    <Field label="Variant"><Select value={l.variant_id} disabled={!vs.length} onChange={(e) => setLine(i, { variant_id: e.target.value })}><option value="">{vs.length ? 'Default' : 'No variants'}</option>{vs.map((v) => <option key={v.id} value={v.id}>{v.attribute}: {v.value} ({v.extra_price >= 0 ? '+' : ''}{v.extra_price})</option>)}</Select></Field>
                    <Field label="Qty"><Input type="number" min="1" step="1" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></Field>
                    <Field label="Tax"><Select value={l.tax_id} onChange={(e) => setLine(i, { tax_id: e.target.value })}><option value="">No tax</option>{taxes.data.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
                    <div className="flex items-end justify-between gap-3 sm:flex-col sm:items-end sm:justify-end"><span className="pb-2 text-sm font-medium">{money(unit(l) * (Number(l.qty) || 0))}</span>
                      {lines.length > 1 && <button type="button" className="text-sm text-bad underline" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>}</div>
                  </div>);
              })}
            </div>
            <button type="button" className="btn-ghost mt-4" onClick={() => setLines([...lines, blankLine()])}>Add a line</button>
          </Card>
        </div>

        <Card className="h-fit space-y-2 p-5 text-sm lg:sticky lg:top-6">
          <h2 className="mb-1 font-semibold">Each billing period</h2>
          <div className="flex justify-between"><span className="text-muted">Plan fee</span><span>{money(planFee)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Lines</span><span>{money(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Tax</span><span>{money(tax)}</span></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Estimated total</span><span>{money(planFee + subtotal + tax)}</span></div>
          <p className="pt-2 text-xs text-muted">Prices come from the product catalog. Discounts and final tax are applied when each invoice is created.</p>
        </Card>
      </div>
    </form>
  );
}