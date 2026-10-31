import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import { api } from '../api';

// ---------- toast ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const show = useCallback((message, kind = 'ok') => { setT({ message, kind }); setTimeout(() => setT(null), 3500); }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div role="status" className={`no-print fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${t.kind === 'ok' ? 'bg-ok' : 'bg-bad'}`}>{t.message}</div>}
    </ToastCtx.Provider>
  );
}

// ---------- layout bits ----------
export const PageHeader = ({ title, subtitle, children }) => (
  <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
    <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);
export const Card = ({ className = '', children }) => <div className={`card ${className}`}>{children}</div>;
export const Spinner = () => <div className="p-8 text-center text-sm text-muted" role="status">Loading…</div>;
export const Empty = ({ title, hint, action }) => (
  <div className="px-6 py-12 text-center"><p className="font-medium">{title}</p>{hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p>}{action && <div className="mt-4">{action}</div>}</div>
);
export const ErrorNote = ({ error }) => error ? <div role="alert" className="mb-4 rounded border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">{error.message || String(error)}</div> : null;

// ---------- status badge ----------
const TONES = {
  paid: 'ok', active: 'ok', confirmed: 'info', draft: 'muted', quotation: 'warn', paused: 'warn', closed: 'muted', cancelled: 'muted', overdue: 'bad',
};
const TONE_CLS = { ok: 'bg-ok-soft text-ok', info: 'bg-info-soft text-info', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', muted: 'bg-paper text-muted border border-line' };
export const Badge = ({ status, children }) => <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TONE_CLS[TONES[status] || 'muted']}`}>{children || status}</span>;

// ---------- forms ----------
export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-bad">{error}</span>}
    </label>
  );
}
export const Input = ({ error, ...p }) => <input {...p} aria-invalid={!!error} className={`input ${error ? 'input-error' : ''} ${p.className || ''}`} />;
export const Select = ({ error, children, ...p }) => <select {...p} aria-invalid={!!error} className={`input ${error ? 'input-error' : ''}`}>{children}</select>;
export const Textarea = ({ error, ...p }) => <textarea rows={3} {...p} className={`input ${error ? 'input-error' : ''}`} />;
export const Check = ({ label, ...p }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" {...p} />{label}</label>;

// ---------- modal ----------
export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k); ref.current?.querySelector('input,select,textarea,button')?.focus();
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-surface shadow-xl sm:rounded-lg ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3"><h2 className="font-semibold">{title}</h2><button className="text-muted hover:text-ink" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------- table ----------
// columns: [{ key, label, render?(row), align? }]
export function Table({ columns, rows, onRowClick, empty }) {
  if (!rows.length) return empty || <Empty title="Nothing here yet" />;
  return (
    <div className="overflow-x-auto">
      <table className="responsive w-full text-left text-sm">
        <thead><tr className="border-b border-line text-muted">{columns.map((c) => <th key={c.key} className={`px-4 py-2.5 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`border-b border-line last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-paper' : ''}`}>
              {columns.map((c) => <td key={c.key} data-label={c.label} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="no-print flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
      <span>{total.toLocaleString()} {total === 1 ? 'record' : 'records'}</span>
      <div className="flex items-center gap-2">
        <button className="btn-ghost !py-1" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className="btn-ghost !py-1" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

// ---------- data hook: server-side pagination + debounced search ----------
export function useList(path, initial = {}) {
  const [params, setParams] = useState({ page: 1, pageSize: 15, ...initial });
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true; setLoading(true);
    const h = setTimeout(() => {
      api.get(path, params).then((d) => { if (live) { setData(d); setError(null); } }).catch((e) => live && setError(e)).finally(() => live && setLoading(false));
    }, params.q ? 250 : 0);
    return () => { live = false; clearTimeout(h); };
  }, [path, JSON.stringify(params), tick]); // eslint-disable-line
  const set = (patch) => setParams((p) => ({ ...p, page: 1, ...patch }));
  return { ...data, params, loading, error, setFilter: set, setPage: (page) => setParams((p) => ({ ...p, page })), reload: () => setTick((t) => t + 1) };
}
// plain fetch-once hook for small reference lists (plans, taxes, products...)
export function useFetch(path, deps = []) {
  const [data, setData] = useState(null); const [error, setError] = useState(null); const [tick, setTick] = useState(0);
  useEffect(() => { let live = true; api.get(path).then((d) => live && setData(d)).catch((e) => live && setError(e)); return () => { live = false; }; }, [path, tick, ...deps]); // eslint-disable-line
  return { data, error, loading: !data && !error, reload: () => setTick((t) => t + 1) };
}

export function FilterBar({ children }) { return <div className="no-print flex flex-wrap items-end gap-3 border-b border-line p-4">{children}</div>; }
export const SearchBox = ({ value, onChange, placeholder = 'Search' }) => (
  <input type="search" aria-label={placeholder} placeholder={placeholder} value={value || ''} onChange={(e) => onChange(e.target.value)} className="input max-w-xs" />
);