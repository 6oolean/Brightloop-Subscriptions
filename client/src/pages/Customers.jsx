import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PageHeader, Card, Table, Pagination, FilterBar, SearchBox, ErrorNote, useList, useToast } from '../components/ui';
import FormModal, { v } from '../components/FormModal';
import { emailValid } from '../validators';

export default function Customers() {
  const toast = useToast(); const list = useList('/customers'); const [modal, setModal] = useState(null);
  const fields = [
    { key: 'name', label: 'Name', required: true, validate: v.len(2, 'Name') },
    { key: 'company', label: 'Company', half: true, nullable: true }, { key: 'phone', label: 'Phone', half: true, nullable: true, validate: (x) => (x && !/^[0-9+()\-\s]{6,20}$/.test(x) ? 'Enter a valid phone number' : null) },
    { key: 'email', label: 'Email', type: 'email', nullable: true, hint: 'Invoices are sent here', validate: (x) => (x && !emailValid(x) ? 'Enter a valid email address' : null) },
    { key: 'address', label: 'Address', type: 'textarea', nullable: true, max: 300 },
  ];
  return (
    <>
      <PageHeader title="Customers" subtitle="People and companies you bill."><button className="btn-primary" onClick={() => setModal({})}>New customer</button></PageHeader>
      <ErrorNote error={list.error} />
      <Card>
        <FilterBar><SearchBox value={list.params.q} onChange={(q) => list.setFilter({ q })} placeholder="Search name, company or email" /></FilterBar>
        <Table rows={list.rows} empty={<p className="px-4 py-10 text-center text-sm text-muted">{list.loading ? 'Loading…' : 'No customers found.'}</p>} columns={[
          { key: 'name', label: 'Name', render: (c) => <span className="font-medium">{c.name}</span> }, { key: 'company', label: 'Company' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
          { key: 'a', label: '', align: 'right', render: (c) => <span className="space-x-3 whitespace-nowrap"><Link className="text-brand underline" to={`/subscriptions?q=${encodeURIComponent(c.name)}`}>Subscriptions</Link><button className="text-brand underline" onClick={() => setModal(c)}>Edit</button></span> }]} />
        <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total || 0} onPage={list.setPage} />
      </Card>
      {modal && <FormModal title={modal.id ? 'Edit customer' : 'New customer'} fields={fields} initial={modal} onClose={() => setModal(null)}
        onSave={async (b) => { await (modal.id ? api.put(`/customers/${modal.id}`, b) : api.post('/customers', b)); toast('Customer saved'); setModal(null); list.reload(); }} />}
    </>
  );
}