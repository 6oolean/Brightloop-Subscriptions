import { useState } from 'react';
import { Modal, Field, Input, Select, Textarea, Check, ErrorNote } from './ui';

// Config-driven form: fields = [{ key, label, type, options, validate(value, form), hint, half, show(form) }]
// Client checks give instant feedback; the server re-validates and its field errors are shown in the same places.
export default function FormModal({ title, fields, initial = {}, onSave, onClose, submitLabel = 'Save', wide }) {
  const [f, setF] = useState(() => Object.fromEntries(fields.map((x) => [x.key, initial[x.key] ?? (x.type === 'checkbox' ? !!x.default : x.type === 'multi' ? [] : x.default ?? '')])));
  const [fe, setFe] = useState({}); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setFe((p) => ({ ...p, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault(); const v = {};
    for (const x of fields) {
      if (x.show && !x.show(f)) continue;
      const val = f[x.key];
      if (x.required && (val === '' || val == null || (Array.isArray(val) && !val.length))) v[x.key] = x.requiredMsg || `${x.label} is required`;
      else if (x.validate) { const m = x.validate(val, f); if (m) v[x.key] = m; }
    }
    setFe(v); if (Object.keys(v).length) return;
    const out = {};
    for (const x of fields) {
      if (x.show && !x.show(f)) continue;
      let val = f[x.key];
      if (x.type === 'number') val = val === '' ? undefined : Number(val);
      else if (x.type === 'checkbox') val = val ? 1 : 0;
      else if (typeof val === 'string' && val === '' && !x.required) val = x.nullable ? null : undefined;
      out[x.key] = val;
    }
    setBusy(true); setErr(null);
    try { await onSave(out); } catch (x) { setErr(x); setFe(x.fields || {}); setBusy(false); }
  };

  return (
    <Modal title={title} onClose={onClose} wide={wide}>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote error={err && !Object.values(fe).some(Boolean) ? err : null} /></div>
        {fields.filter((x) => !x.show || x.show(f)).map((x) => {
          const span = x.half ? '' : 'sm:col-span-2'; const e = fe[x.key]; const id = x.key;
          if (x.type === 'checkbox') return <div key={id} className={span}><Check label={x.label} checked={!!f[id]} onChange={(ev) => set(id, ev.target.checked)} /></div>;
          if (x.type === 'multi') return (
            <fieldset key={id} className={span}><legend className="mb-1 text-sm font-medium">{x.label}</legend>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded border border-line p-2">{x.options.map((o) => (
                <Check key={o.value} label={o.label} checked={f[id].includes(o.value)} onChange={(ev) => set(id, ev.target.checked ? [...f[id], o.value] : f[id].filter((y) => y !== o.value))} />))}</div>
              {e && <span role="alert" className="mt-1 block text-xs text-bad">{e}</span>}</fieldset>);
          return (
            <Field key={id} label={x.label} error={e} hint={x.hint} className={span}>
              {x.type === 'select' ? <Select error={e} value={f[id]} onChange={(ev) => set(id, ev.target.value)}><option value="">Select…</option>{x.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                : x.type === 'textarea' ? <Textarea error={e} maxLength={x.max} value={f[id]} onChange={(ev) => set(id, ev.target.value)} />
                : <Input type={x.type || 'text'} step={x.type === 'number' ? 'any' : undefined} min={x.min} max={x.max} maxLength={x.type === 'text' || !x.type ? x.max || 200 : undefined} autoComplete={x.autoComplete} error={e} value={f[id]} onChange={(ev) => set(id, ev.target.value)} />}
            </Field>);
        })}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button></div>
      </form>
    </Modal>
  );
}

// small shared validators
export const v = {
  min: (n, label) => (x) => (x !== '' && Number(x) < n ? `${label} cannot be below ${n}` : null),
  nonNeg: (label) => (x) => (x === '' || Number.isNaN(Number(x)) ? `${label} must be a number` : Number(x) < 0 ? `${label} cannot be negative` : null),
  len: (n, label) => (x) => (String(x).trim().length < n ? `${label} must be at least ${n} characters` : null),
};
