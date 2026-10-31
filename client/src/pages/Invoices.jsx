import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { PageHeader, Card, Table, Pagination, Badge, FilterBar, SearchBox, Select, Field, Input, ErrorNote, useList, useToast } from '../components/ui';
import { money, dateFmt } from '../validators';

export const InvoiceBadge = ({ r }) => (r.overdue ? <Badge status="overdue">Overdue</Badge> : <Badge status={r.status} />);

export function invoiceColumns({ portal } = {}) {
  return [
    { key: 'number', label: 'Invoice', render: (r) => <span className="font-medium">{r.number}</span> },
    ...(portal ? [] : [{ key: 'customer_name', label: 'Customer' }]),
    { key: 'period_start', label: 'Period', render: (r) => `${dateFmt(r.period_start)} – ${dateFmt(r.period_end)}` },
    { key: 'due_date', label: 'Due', render: (r) => dateFmt(r.due_date) },
    { key: 'total', label: 'Total', align: 'right', render: (r) => money(r.total) },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => (r.status === 'cancelled' || r.status === 'draft' ? '—' : money(r.balance)) },
    { key: 'status', label: 'Status', render: (r) => <InvoiceBadge r={r} /> },
  ];
}

export default function Invoices() {
  const nav = useNavigate(); const toast = useToast(); const [sp] = useSearchParams();
  const list = useList('/invoices', { q: sp.get('q') || '', status: sp.get('status') || '', overdue: sp.get('overdue') || '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const [asOf, setAsOf] = useState('');

  const runBilling = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/billing/run', asOf ? { as_of: asOf } : {});
      toast(r.created ? `Created ${r.created} invoice${r.created === 1 ? '' : 's'}${r.skipped ? `, ${r.skipped} already billed` : ''}` : 'Nothing was due. No duplicates created.');
      if (r.failed.length) setErr({ message: `${r.failed.length} subscription(s) failed: ${r.failed.map((f) => f.subscription).join(', ')}` });
      list.reload();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const confirmAll = async () => {
    if (!window.confirm('Confirm every draft invoice?')) return;
    try { const r = await api.post('/invoices/confirm-all'); toast(`Confirmed ${r.confirmed} invoices`); list.reload(); } catch (e) { setErr(e); }
  };

  return (
    <>
      <PageHeader title="Invoices" subtitle="Created from subscriptions. Running billing twice never bills a period twice.">
        <button className="btn-ghost" onClick={confirmAll}>Confirm all drafts</button>
        <button className="btn-primary" disabled={busy} onClick={runBilling}>{busy ? 'Billing…' : 'Run billing'}</button>
      </PageHeader>
      <ErrorNote error={err || list.error} />
      <Card>
        <FilterBar>
          <SearchBox value={list.params.q} onChange={(q) => list.setFilter({ q })} placeholder="Search invoice or customer" />
          <Select aria-label="Status" value={list.params.overdue === '1' ? 'overdue' : list.params.status} onChange={(e) => { const v = e.target.value; list.setFilter(v === 'overdue' ? { status: '', overdue: '1' } : { status: v, overdue: '' }); }}>
            <option value="">All invoices</option><option value="draft">Draft</option><option value="confirmed">Confirmed</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option><option value="overdue">Overdue</option></Select>
          <Field label="Issued from"><Input type="date" value={list.params.from || ''} onChange={(e) => list.setFilter({ from: e.target.value })} /></Field>
          <Field label="to"><Input type="date" value={list.params.to || ''} onChange={(e) => list.setFilter({ to: e.target.value })} /></Field>
          <Field label="Bill as of" hint="Optional, for catching up"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
        </FilterBar>
        <Table rows={list.rows} columns={invoiceColumns()} onRowClick={(r) => nav(`/invoices/${r.id}`)}
          empty={<p className="px-4 py-10 text-center text-sm text-muted">{list.loading ? 'Loading…' : 'No invoices match these filters.'}</p>} />
        <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total || 0} onPage={list.setPage} />
      </Card>
    </>
  );
}