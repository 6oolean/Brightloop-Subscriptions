import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, Table, Pagination, Badge, Empty, Spinner, ErrorNote, useFetch, useList } from '../components/ui';
import { invoiceColumns } from './Invoices';
import { money, dateFmt } from '../validators';

// Customer portal. Every call hits /me/*, where the server takes identity from the login token.
export function MySubscriptions() {
  const { data, error } = useFetch('/me/subscriptions');
  if (error) return <ErrorNote error={error} />; if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="My subscriptions" subtitle="What you are subscribed to and when you are billed next." />
      <Card><Table rows={data} empty={<Empty title="No subscriptions yet" hint="When our team sets up your subscription it will show up here." />} columns={[
        { key: 'number', label: 'Subscription', render: (s) => <span className="font-medium">{s.number}</span> }, { key: 'plan_name', label: 'Plan', render: (s) => <>{s.plan_name}<div className="text-xs capitalize text-muted">{s.billing_period}</div></> },
        { key: 'recurring_amount', label: 'Per period', align: 'right', render: (s) => money(s.recurring_amount) }, { key: 'next_invoice_date', label: 'Next invoice', render: (s) => dateFmt(s.next_invoice_date) },
        { key: 'expiry_date', label: 'Ends', render: (s) => dateFmt(s.expiry_date) }, { key: 'status', label: 'Status', render: (s) => <Badge status={s.status} /> }]} /></Card>
    </>
  );
}
export function MyInvoices() {
  const nav = useNavigate(); const list = useList('/me/invoices');
  return (
    <>
      <PageHeader title="My invoices" subtitle="Open an invoice to view or print it." />
      <ErrorNote error={list.error} />
      <Card><Table rows={list.rows} columns={invoiceColumns({ portal: true })} onRowClick={(r) => nav(`/my/invoices/${r.id}`)} empty={<Empty title={list.loading ? 'Loading…' : 'No invoices yet'} hint="Invoices appear here once they are issued." />} />
        <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total || 0} onPage={list.setPage} /></Card>
    </>
  );
}