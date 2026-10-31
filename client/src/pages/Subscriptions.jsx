import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { PageHeader, Card, Table, Pagination, Badge, FilterBar, SearchBox, Select, ErrorNote, useList } from '../components/ui';
import { money, dateFmt } from '../validators';

export const SUB_STATUSES = ['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed'];

export default function Subscriptions() {
  const nav = useNavigate(); const [sp] = useSearchParams();
  const list = useList('/subscriptions', { status: sp.get('status') || '' });
  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Every customer subscription and where it stands."><Link to="/subscriptions/new" className="btn-primary">New subscription</Link></PageHeader>
      <ErrorNote error={list.error} />
      <Card>
        <FilterBar>
          <SearchBox value={list.params.q} onChange={(q) => list.setFilter({ q })} placeholder="Search number or customer" />
          <Select aria-label="Status" value={list.params.status} onChange={(e) => list.setFilter({ status: e.target.value })}>
            <option value="">All statuses</option>{SUB_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</Select>
        </FilterBar>
        <Table rows={list.rows} onRowClick={(r) => nav(`/subscriptions/${r.id}`)}
          empty={<p className="px-4 py-10 text-center text-sm text-muted">{list.loading ? 'Loading…' : 'No subscriptions match these filters.'}</p>}
          columns={[
            { key: 'number', label: 'Number', render: (r) => <span className="font-medium">{r.number}</span> },
            { key: 'customer_name', label: 'Customer', render: (r) => <>{r.customer_name}{r.customer_company && <div className="text-xs text-muted">{r.customer_company}</div>}</> },
            { key: 'plan_name', label: 'Plan', render: (r) => <>{r.plan_name}<div className="text-xs capitalize text-muted">{r.billing_period}</div></> },
            { key: 'next_invoice_date', label: 'Next invoice', render: (r) => dateFmt(r.next_invoice_date) },
            { key: 'recurring_amount', label: 'Recurring', align: 'right', render: (r) => money(r.recurring_amount) },
            { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          ]} />
        <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total || 0} onPage={list.setPage} />
      </Card>
    </>
  );
}