import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { PageHeader, Card, Table, Badge, Spinner, ErrorNote, Modal, Empty, Field, Input, Select, useFetch, useToast } from '../components/ui';
import FormModal, { v } from '../components/FormModal';
import { money, dateFmt, passwordValid } from '../validators';

// Shared: admin sees write buttons, staff gets read-only (the API enforces this too).
const useCanWrite = () => useAuth().user.role === 'admin';
const useSave = (reload, toast) => async (fn, msg, close) => { await fn(); toast(msg); close(); reload(); };

// ---------------- Products + variants ----------------
export function Products() {
  const w = useCanWrite(); const toast = useToast();
  const { data, error, reload } = useFetch('/products'); const variants = useFetch('/variants');
  const [modal, setModal] = useState(null); const [vp, setVp] = useState(null);
  const save = useSave(() => { reload(); variants.reload(); }, toast);
  if (error) return <ErrorNote error={error} />; if (!data || !variants.data) return <Spinner />;
  const fields = [
    { key: 'name', label: 'Name', required: true, validate: v.len(2, 'Name') },
    { key: 'type', label: 'Type', type: 'select', required: true, half: true, options: ['software', 'service', 'addon', 'physical'].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) })) },
    { key: 'sales_price', label: 'Sales price', type: 'number', required: true, half: true, validate: v.nonNeg('Sales price') },
    { key: 'cost_price', label: 'Cost price', type: 'number', half: true, default: 0, validate: v.nonNeg('Cost price') },
    { key: 'active', label: 'Available to sell', type: 'checkbox', default: true },
    { key: 'notes', label: 'Notes', type: 'textarea', nullable: true, max: 1000 },
  ];
  const vfields = [{ key: 'attribute', label: 'Attribute', required: true, hint: 'For example Brand', half: true }, { key: 'value', label: 'Value', required: true, hint: 'For example Odoo', half: true },
    { key: 'extra_price', label: 'Extra price', type: 'number', default: 0, hint: 'Added to the product price. Odoo brand adds 560.', validate: (x) => (x !== '' && Number.isNaN(Number(x)) ? 'Enter a number' : null) }];
  return (
    <>
      <PageHeader title="Products" subtitle="What you sell, and the variants customers can choose.">{w && <button className="btn-primary" onClick={() => setModal({})}>New product</button>}</PageHeader>
      <Card><Table rows={data} empty={<Empty title="No products yet" hint="Add your first product to start building plans." />} columns={[
        { key: 'name', label: 'Product', render: (p) => <><span className="font-medium">{p.name}</span>{!p.active && <span className="ml-2 text-xs text-muted">(inactive)</span>}</> },
        { key: 'type', label: 'Type', render: (p) => <span className="capitalize">{p.type}</span> }, { key: 'sales_price', label: 'Sales price', align: 'right', render: (p) => money(p.sales_price) },
        { key: 'cost_price', label: 'Cost', align: 'right', render: (p) => money(p.cost_price) },
        { key: 'variants', label: 'Variants', render: (p) => { const vs = variants.data.filter((x) => x.product_id === p.id); return vs.length ? vs.map((x) => `${x.value}${x.extra_price ? ` (${x.extra_price > 0 ? '+' : ''}${x.extra_price})` : ''}`).join(', ') : '—'; } },
        { key: 'a', label: '', align: 'right', render: (p) => w && <span className="space-x-3 whitespace-nowrap"><button className="text-brand underline" onClick={() => setVp(p)}>Variants</button><button className="text-brand underline" onClick={() => setModal(p)}>Edit</button></span> }]} /></Card>
      {modal && <FormModal title={modal.id ? 'Edit product' : 'New product'} fields={fields} initial={modal} onClose={() => setModal(null)} onSave={(b) => save(() => (modal.id ? api.put(`/products/${modal.id}`, b) : api.post('/products', b)), 'Product saved', () => setModal(null))} />}
      {vp && <VariantManager product={vp} variants={variants.data.filter((x) => x.product_id === vp.id)} fields={vfields} onClose={() => setVp(null)} onChanged={() => variants.reload()} />}
    </>
  );
}
function VariantManager({ product, variants, fields, onClose, onChanged }) {
  const [adding, setAdding] = useState(false); const toast = useToast(); const [err, setErr] = useState(null);
  const remove = async (id) => { try { await api.del(`/variants/${id}`); toast('Variant removed'); onChanged(); } catch (e) { setErr(e); } };
  if (adding) return <FormModal title={`Add variant to ${product.name}`} fields={fields} onClose={() => setAdding(false)} onSave={async (b) => { await api.post(`/products/${product.id}/variants`, b); toast('Variant added'); setAdding(false); onChanged(); }} />;
  return (
    <Modal title={`Variants of ${product.name}`} onClose={onClose}>
      <ErrorNote error={err} />
      {variants.length ? <ul className="divide-y divide-line text-sm">{variants.map((x) => <li key={x.id} className="flex items-center justify-between py-2"><span>{x.attribute}: <b>{x.value}</b> <span className="text-muted">({x.extra_price >= 0 ? '+' : ''}{money(x.extra_price)})</span></span><button className="text-bad underline" onClick={() => remove(x.id)}>Remove</button></li>)}</ul> : <p className="text-sm text-muted">No variants yet.</p>}
      <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={() => setAdding(true)}>Add variant</button></div>
    </Modal>
  );
}

// ---------------- Plans ----------------
export function Plans() {
  const w = useCanWrite(); const toast = useToast(); const { data, error, reload } = useFetch('/plans'); const [modal, setModal] = useState(null); const save = useSave(reload, toast);
  if (error) return <ErrorNote error={error} />; if (!data) return <Spinner />;
  const fields = [
    { key: 'name', label: 'Plan name', required: true, validate: v.len(2, 'Name') },
    { key: 'price', label: 'Plan fee', type: 'number', required: true, half: true, validate: v.nonNeg('Plan fee'), hint: 'Billed once per period, on top of product lines' },
    { key: 'billing_period', label: 'Billing period', type: 'select', required: true, half: true, options: ['daily', 'weekly', 'monthly', 'yearly'].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) })) },
    { key: 'min_qty', label: 'Minimum quantity', type: 'number', required: true, half: true, default: 1, validate: (x) => (!Number.isInteger(Number(x)) || Number(x) < 1 ? 'Whole number, at least 1' : null) },
    { key: 'available_from', label: 'Available from', type: 'date', half: true, nullable: true },
    { key: 'available_to', label: 'Available until', type: 'date', half: true, nullable: true, validate: (x, f) => (x && f.available_from && x < f.available_from ? 'Must be on or after the start date' : null) },
    { key: 'auto_close', label: 'Close automatically when the plan ends', type: 'checkbox' },
    { key: 'allow_early_close', label: 'Allow closing early', type: 'checkbox', default: true },
    { key: 'allow_pause', label: 'Allow pausing', type: 'checkbox', default: true },
    { key: 'allow_renew', label: 'Allow renewing', type: 'checkbox', default: true },
  ];
  const rules = (p) => [p.auto_close && 'Auto-closes', p.allow_early_close && 'Early close', p.allow_pause && 'Pause', p.allow_renew && 'Renew'].filter(Boolean).join(', ') || 'None';
  return (
    <>
      <PageHeader title="Plans" subtitle="How often a subscription bills and what it is allowed to do.">{w && <button className="btn-primary" onClick={() => setModal({})}>New plan</button>}</PageHeader>
      <Card><Table rows={data} empty={<Empty title="No plans yet" hint="Create a plan to start taking subscriptions." />} columns={[
        { key: 'name', label: 'Plan', render: (p) => <span className="font-medium">{p.name}</span> }, { key: 'price', label: 'Fee', render: (p) => money(p.price) },
        { key: 'billing_period', label: 'Billing', render: (p) => <span className="capitalize">{p.billing_period}</span> }, { key: 'min_qty', label: 'Min qty' },
        { key: 'available', label: 'Available', render: (p) => `${dateFmt(p.available_from)} – ${p.available_to ? dateFmt(p.available_to) : 'open'}` }, { key: 'rules', label: 'Allowed', render: rules },
        { key: 'a', label: '', align: 'right', render: (p) => w && <button className="text-brand underline" onClick={() => setModal(p)}>Edit</button> }]} /></Card>
      {modal && <FormModal wide title={modal.id ? 'Edit plan' : 'New plan'} fields={fields} initial={modal} onClose={() => setModal(null)} onSave={(b) => save(() => (modal.id ? api.put(`/plans/${modal.id}`, b) : api.post('/plans', b)), 'Plan saved', () => setModal(null))} />}
    </>
  );
}

// ---------------- Discounts & taxes ----------------
export function PricingRules() {
  const w = useCanWrite(); const toast = useToast();
  const taxes = useFetch('/taxes'); const discounts = useFetch('/discounts'); const products = useFetch('/products');
  const [modal, setModal] = useState(null); const reloadAll = () => { taxes.reload(); discounts.reload(); }; const save = useSave(reloadAll, toast);
  if (!taxes.data || !discounts.data || !products.data) return <Spinner />;
  const taxFields = [{ key: 'name', label: 'Tax name', required: true, validate: v.len(2, 'Name'), half: true }, { key: 'rate_pct', label: 'Rate (%)', type: 'number', required: true, half: true, validate: (x) => (Number(x) < 0 || Number(x) > 100 ? 'Between 0 and 100' : null) }, { key: 'active', label: 'Active', type: 'checkbox', default: true }];
  const discFields = [
    { key: 'name', label: 'Discount name', required: true, validate: v.len(2, 'Name') },
    { key: 'type', label: 'Type', type: 'select', required: true, half: true, options: [{ value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }] },
    { key: 'value', label: 'Value', type: 'number', required: true, half: true, validate: (x, f) => (Number(x) <= 0 ? 'Must be greater than 0' : f.type === 'percent' && Number(x) > 100 ? 'A percentage cannot exceed 100' : null) },
    { key: 'min_purchase', label: 'Minimum purchase', type: 'number', half: true, default: 0, validate: v.nonNeg('Minimum purchase') },
    { key: 'min_qty', label: 'Minimum quantity', type: 'number', half: true, default: 0, validate: (x) => (!Number.isInteger(Number(x)) || Number(x) < 0 ? 'Whole number, 0 or more' : null) },
    { key: 'start_date', label: 'Starts', type: 'date', required: true, half: true }, { key: 'end_date', label: 'Ends', type: 'date', required: true, half: true, validate: (x, f) => (x < f.start_date ? 'Must be on or after the start date' : null) },
    { key: 'usage_limit', label: 'Usage limit', type: 'number', nullable: true, hint: 'Leave empty for unlimited', validate: (x) => (x !== '' && (!Number.isInteger(Number(x)) || Number(x) < 1) ? 'Whole number, at least 1' : null) },
    { key: 'applies_to', label: 'Applies to', type: 'select', required: true, options: [{ value: 'product', label: 'Specific products' }, { value: 'subscription', label: 'Whole subscriptions (chosen on the subscription)' }] },
    { key: 'product_ids', label: 'Products', type: 'multi', show: (f) => f.applies_to === 'product', required: true, requiredMsg: 'Choose at least one product', options: products.data.map((p) => ({ value: p.id, label: p.name })) },
    { key: 'active', label: 'Active', type: 'checkbox', default: true },
  ];
  return (
    <>
      <PageHeader title="Discounts & taxes" subtitle="Rules the billing engine applies automatically on every invoice.">{w && <><button className="btn-ghost" onClick={() => setModal({ kind: 'tax' })}>New tax</button><button className="btn-primary" onClick={() => setModal({ kind: 'discount' })}>New discount</button></>}</PageHeader>
      <div className="grid gap-6">
        <Card><h2 className="p-4 font-semibold">Discounts</h2><Table rows={discounts.data} empty={<Empty title="No discounts" hint="Create one to reward larger purchases." />} columns={[
          { key: 'name', label: 'Name', render: (d) => <span className="font-medium">{d.name}</span> }, { key: 'value', label: 'Value', render: (d) => (d.type === 'percent' ? `${d.value}%` : money(d.value)) },
          { key: 'applies_to', label: 'Applies to', render: (d) => (d.applies_to === 'subscription' ? 'Whole subscription' : `${d.product_ids.length} product(s)`) },
          { key: 'cond', label: 'Conditions', render: (d) => [d.min_purchase > 0 && `min ${money(d.min_purchase)}`, d.min_qty > 0 && `min qty ${d.min_qty}`].filter(Boolean).join(', ') || 'None' },
          { key: 'window', label: 'Valid', render: (d) => `${dateFmt(d.start_date)} – ${dateFmt(d.end_date)}` }, { key: 'used', label: 'Used', render: (d) => `${d.times_used}${d.usage_limit ? ' / ' + d.usage_limit : ''}` },
          { key: 'active', label: 'Status', render: (d) => <Badge status={d.active ? 'active' : 'closed'}>{d.active ? 'Active' : 'Off'}</Badge> },
          { key: 'a', label: '', align: 'right', render: (d) => w && <button className="text-brand underline" onClick={() => setModal({ kind: 'discount', row: d })}>Edit</button> }]} /></Card>
        <Card><h2 className="p-4 font-semibold">Taxes</h2><Table rows={taxes.data} empty={<Empty title="No taxes" />} columns={[
          { key: 'name', label: 'Name', render: (t) => <span className="font-medium">{t.name}</span> }, { key: 'rate_pct', label: 'Rate', render: (t) => `${t.rate_pct}%` },
          { key: 'active', label: 'Status', render: (t) => <Badge status={t.active ? 'active' : 'closed'}>{t.active ? 'Active' : 'Off'}</Badge> },
          { key: 'a', label: '', align: 'right', render: (t) => w && <button className="text-brand underline" onClick={() => setModal({ kind: 'tax', row: t })}>Edit</button> }]} /></Card>
      </div>
      {modal?.kind === 'tax' && <FormModal title={modal.row ? 'Edit tax' : 'New tax'} fields={taxFields} initial={modal.row} onClose={() => setModal(null)} onSave={(b) => save(() => (modal.row ? api.put(`/taxes/${modal.row.id}`, b) : api.post('/taxes', b)), 'Tax saved', () => setModal(null))} />}
      {modal?.kind === 'discount' && <FormModal wide title={modal.row ? 'Edit discount' : 'New discount'} fields={discFields} initial={modal.row} onClose={() => setModal(null)} onSave={(b) => save(() => (modal.row ? api.put(`/discounts/${modal.row.id}`, b) : api.post('/discounts', b)), 'Discount saved', () => setModal(null))} />}
    </>
  );
}

// ---------------- Quotation templates ----------------
export function Templates() {
  const w = useCanWrite(); const toast = useToast();
  const { data, error, reload } = useFetch('/quotation-templates'); const plans = useFetch('/plans'); const products = useFetch('/products'); const variants = useFetch('/variants');
  const [modal, setModal] = useState(null);
  if (error) return <ErrorNote error={error} />; if (!data || !plans.data || !products.data || !variants.data) return <Spinner />;
  const remove = async (t) => { if (!window.confirm(`Delete template "${t.name}"?`)) return; try { await api.del(`/quotation-templates/${t.id}`); toast('Template deleted'); reload(); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <>
      <PageHeader title="Quotation templates" subtitle="Reusable plan and product lines, so offers are not built from scratch.">{w && <button className="btn-primary" onClick={() => setModal({})}>New template</button>}</PageHeader>
      <Card><Table rows={data} empty={<Empty title="No templates yet" hint="Save a common bundle once and start every quote from it." />} columns={[
        { key: 'name', label: 'Template', render: (t) => <span className="font-medium">{t.name}</span> }, { key: 'plan', label: 'Plan', render: (t) => plans.data.find((p) => p.id === t.plan_id)?.name || '—' },
        { key: 'validity_days', label: 'Valid for', render: (t) => `${t.validity_days} days` }, { key: 'lines', label: 'Lines', render: (t) => t.lines.map((l) => `${l.qty} × ${l.product_name}`).join(', ') },
        { key: 'a', label: '', align: 'right', render: (t) => w && <span className="space-x-3"><button className="text-brand underline" onClick={() => setModal(t)}>Edit</button><button className="text-bad underline" onClick={() => remove(t)}>Delete</button></span> }]} /></Card>
      {modal && <TemplateForm tpl={modal} plans={plans.data} products={products.data} variants={variants.data} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Template saved'); reload(); }} />}
    </>
  );
}
function TemplateForm({ tpl, plans, products, variants, onClose, onSaved }) {
  const [f, setF] = useState({ name: tpl.name || '', plan_id: tpl.plan_id || '', validity_days: tpl.validity_days || 30 });
  const [lines, setLines] = useState(tpl.lines?.length ? tpl.lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id || '', qty: l.qty })) : [{ product_id: '', variant_id: '', qty: 1 }]);
  const [fe, setFe] = useState({}); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); const x = {};
    if (f.name.trim().length < 2) x.name = 'Enter a template name'; if (!f.plan_id) x.plan_id = 'Pick a plan';
    if (!(Number(f.validity_days) >= 1)) x.validity_days = 'At least 1 day';
    if (lines.some((l) => !l.product_id || !(Number(l.qty) >= 1))) x.lines = 'Each line needs a product and a quantity of at least 1';
    setFe(x); if (Object.keys(x).length) return; setBusy(true); setErr(null);
    try {
      const body = { name: f.name.trim(), plan_id: Number(f.plan_id), validity_days: Number(f.validity_days), lines: lines.map((l) => ({ product_id: Number(l.product_id), variant_id: l.variant_id ? Number(l.variant_id) : null, qty: Number(l.qty) })) };
      await (tpl.id ? api.put(`/quotation-templates/${tpl.id}`, body) : api.post('/quotation-templates', body)); onSaved();
    } catch (z) { setErr(z); setFe(z.fields || {}); setBusy(false); }
  };
  const upd = (i, p) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <Modal wide title={tpl.id ? 'Edit template' : 'New template'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4"><ErrorNote error={err && !Object.keys(fe).length ? err : null} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" error={fe.name} className="sm:col-span-3"><Input error={fe.name} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Plan" error={fe.plan_id} className="sm:col-span-2"><Select error={fe.plan_id} value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })}><option value="">Select…</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Valid for (days)" error={fe.validity_days}><Input type="number" min="1" error={fe.validity_days} value={f.validity_days} onChange={(e) => setF({ ...f, validity_days: e.target.value })} /></Field>
        </div>
        {fe.lines && <p role="alert" className="text-sm text-bad">{fe.lines}</p>}
        {lines.map((l, i) => { const vs = variants.filter((x) => x.product_id === Number(l.product_id)); return (
          <div key={i} className="grid gap-3 sm:grid-cols-[2fr_1.5fr_80px_auto]">
            <Select aria-label="Product" value={l.product_id} onChange={(e) => upd(i, { product_id: e.target.value, variant_id: '' })}><option value="">Product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select aria-label="Variant" disabled={!vs.length} value={l.variant_id} onChange={(e) => upd(i, { variant_id: e.target.value })}><option value="">{vs.length ? 'Default' : 'No variants'}</option>{vs.map((x) => <option key={x.id} value={x.id}>{x.attribute}: {x.value}</option>)}</Select>
            <Input aria-label="Quantity" type="number" min="1" value={l.qty} onChange={(e) => upd(i, { qty: e.target.value })} />
            {lines.length > 1 ? <button type="button" className="text-sm text-bad underline" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button> : <span />}</div>); })}
        <button type="button" className="btn-ghost" onClick={() => setLines([...lines, { product_id: '', variant_id: '', qty: 1 }])}>Add a line</button>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save template'}</button></div>
      </form>
    </Modal>
  );
}
// ---------------- Team (admin only) ----------------
export function Team() {
  const toast = useToast(); const { data, error, reload } = useFetch('/auth/staff'); const [modal, setModal] = useState(false);
  if (error) return <ErrorNote error={error} />; if (!data) return <Spinner />;
  const fields = [{ key: 'name', label: 'Full name', required: true, validate: v.len(2, 'Name') },
    { key: 'email', label: 'Work email', type: 'email', required: true, validate: (x) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x) ? null : 'Enter a valid email address') },
    { key: 'password', label: 'Temporary password', type: 'password', required: true, autoComplete: 'new-password', hint: 'More than 8 characters with upper case, lower case and a special character', validate: (x) => (passwordValid(x) ? null : 'Password does not meet the rules') }];
  return (
    <>
      <PageHeader title="Team" subtitle="Only admins can add staff. Staff can manage customers, subscriptions and invoices, but not pricing rules."><button className="btn-primary" onClick={() => setModal(true)}>Add staff member</button></PageHeader>
      <Card><Table rows={data} columns={[{ key: 'name', label: 'Name', render: (u) => <span className="font-medium">{u.name}</span> }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role', render: (u) => <Badge status={u.role === 'admin' ? 'active' : 'confirmed'}>{u.role}</Badge> }, { key: 'created_at', label: 'Added', render: (u) => dateFmt(u.created_at.slice(0, 10)) }]} /></Card>
      {modal && <FormModal title="Add staff member" fields={fields} onClose={() => setModal(false)} onSave={async (b) => { await api.post('/auth/staff', b); toast('Staff member added'); setModal(false); reload(); }} />}
    </>
  );
}