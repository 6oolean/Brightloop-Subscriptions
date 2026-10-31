import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, Table, Pagination, FilterBar, SearchBox, Select, Field, Input, ErrorNote, useList } from '../components/ui';
import { money, dateFmt, methodLabel } from '../validators';

export default function Payments() {
  const nav = useNavigate(); const list = useList('/payments');
  return (
    <>
      <PageHeader title="Payments" subtitle="Every payment recorded against an invoice. Record new ones from the invoice itself." />
      <ErrorNote error={list.error} />
      <Card>
        <FilterBar>
          <SearchBox value={list.params.q} onChange={(q) => list.setFilter({ q })} placeholder="Search invoice or customer" />
          <Select aria-label="Method" value={list.params.method || ''} onChange={(e) => list.setFilter({ method: e.target.value })}>
            <option value="">All methods</option>{[['bank_transfer', 'Bank transfer'], ['card', 'Card'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['cash', 'Cash']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Field label="From"><Input type="date" value={list.params.from || ''} onChange={(e) => list.setFilter({ from: e.target.value })} /></Field>
          <Field label="To"><Input type="date" value={list.params.to || ''} onChange={(e) => list.setFilter({ to: e.target.value })} /></Field>
        </FilterBar>
        <Table rows={list.rows} onRowClick={(r) => nav(`/invoices/${r.invoice_id}`)} empty={<p className="px-4 py-10 text-center text-sm text-muted">{list.loading ? 'Loading…' : 'No payments match these filters.'}</p>}
          columns={[{ key: 'paid_on', label: 'Date', render: (r) => dateFmt(r.paid_on) }, { key: 'invoice_number', label: 'Invoice', render: (r) => <span className="font-medium">{r.invoice_number}</span> },
            { key: 'customer_name', label: 'Customer' }, { key: 'method', label: 'Method', render: (r) => methodLabel(r.method) },
            { key: 'note', label: 'Note', render: (r) => r.note || '—' }, { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) }]} />
        <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total || 0} onPage={list.setPage} />
      </Card>
    </>
  );
}