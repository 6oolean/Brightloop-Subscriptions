import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api';
import { Card, PageHeader, Spinner, ErrorNote, Field, Input, Table, Badge, useList } from '../components/ui';
import { money, dateFmt, methodLabel } from '../validators';

const Kpi = ({ label, value, sub, tone, to }) => {
  const body = (<><div className="text-sm text-muted">{label}</div><div className={`mt-1 text-2xl font-semibold ${tone || ''}`}>{value}</div>{sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}</>);
  return to ? <Link to={to} className="card block p-4 transition-colors hover:border-brand">{body}</Link> : <Card className="p-4">{body}</Card>;
};

export default function Dashboard() {
  const nav = useNavigate();
  const [range, setRange] = useState({ from: '', to: '' });
  const [s, setS] = useState(null); const [err, setErr] = useState(null);
  const overdue = useList('/reports/overdue', { pageSize: 8 });
  useEffect(() => { setS(null); api.get('/reports/summary', range).then(setS).catch(setErr); }, [range.from, range.to]); // eslint-disable-line

  if (err) return <ErrorNote error={err} />;
  const preset = (days) => { const t = new Date(), f = new Date(); f.setDate(t.getDate() - days); setRange({ from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) }); };

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Recurring revenue, collections and what needs chasing.">
        <Link to="/invoices" className="btn-primary">Run billing</Link>
      </PageHeader>

      <Card className="mb-6 flex flex-wrap items-end gap-3 p-4">
        <Field label="From"><Input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        <div className="flex gap-2"><button className="btn-ghost" onClick={() => preset(30)}>Last 30 days</button><button className="btn-ghost" onClick={() => preset(90)}>Last 90 days</button><button className="btn-ghost" onClick={() => setRange({ from: '', to: '' })}>All time</button></div>
      </Card>

      {!s ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
            <Kpi label="Active subscriptions" value={s.subscriptions.active.toLocaleString()} sub={`${(s.subscriptions.byStatus.paused || 0)} paused`} to="/subscriptions" />
            <Kpi label="Monthly recurring revenue" value={money(s.mrr)} sub="Before tax and discounts" />
            <Kpi label="Revenue collected" value={money(s.revenue.collected)} sub={`${s.revenue.payments.toLocaleString()} payments`} tone="text-ok" to="/payments" />
            <Kpi label="Still owed" value={money(s.outstanding.amount)} sub={`${s.outstanding.count.toLocaleString()} open invoices`} to="/invoices" />
            <Kpi label="Overdue" value={money(s.overdue.amount)} sub={`${s.overdue.count.toLocaleString()} invoices`} tone={s.overdue.count ? 'text-bad' : ''} />
          </div>
          {s.draftInvoices > 0 && <p className="mt-4 rounded border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">{s.draftInvoices.toLocaleString()} draft invoices are waiting to be confirmed. <Link className="underline" to="/invoices?status=draft">Review them</Link></p>}

          <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">Revenue collected by month</h2>
              {s.byMonth.length ? (
                <div className="h-64" role="img" aria-label="Bar chart of revenue collected per month">
                  <ResponsiveContainer><BarChart data={s.byMonth} margin={{ left: 0, right: 8, top: 4 }}>
                    <CartesianGrid vertical={false} stroke="#dfe3dc" /><XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} width={56} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                    <Tooltip formatter={(v) => money(v)} cursor={{ fill: '#e1f0ee' }} /><Bar name="Revenue" dataKey="revenue" fill="#0b5d57" radius={[3, 3, 0, 0]} />
                  </BarChart></ResponsiveContainer>
                </div>) : <p className="py-10 text-center text-sm text-muted">No payments in this range.</p>}
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">Subscriptions by status</h2>
              <ul className="space-y-2 text-sm">{Object.entries(s.subscriptions.byStatus).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between"><Link to={`/subscriptions?status=${k}`}><Badge status={k} /></Link><span className="font-medium">{v.toLocaleString()}</span></li>))}</ul>
              <h2 className="mb-3 mt-6 font-semibold">Payments by method</h2>
              <ul className="space-y-2 text-sm">{s.byMethod.map((m) => <li key={m.method} className="flex justify-between"><span>{methodLabel(m.method)}</span><span className="font-medium">{money(m.amount)}</span></li>)}</ul>
            </Card>
          </div>

          <Card className="mt-6">
            <div className="flex items-center justify-between p-4"><h2 className="font-semibold">Overdue invoices</h2><Link className="text-sm text-brand underline" to="/invoices?overdue=1">See all</Link></div>
            <Table rows={overdue.rows} onRowClick={(r) => nav(`/invoices/${r.id}`)} empty={<p className="px-4 pb-8 text-center text-sm text-muted">{overdue.loading ? 'Loading…' : 'Nothing is overdue. Nice.'}</p>}
              columns={[{ key: 'number', label: 'Invoice' }, { key: 'customer_name', label: 'Customer' }, { key: 'due_date', label: 'Due', render: (r) => dateFmt(r.due_date) },
                { key: 'days_overdue', label: 'Days late', render: (r) => <span className="font-medium text-bad">{r.days_overdue}</span> }, { key: 'balance', label: 'Balance', align: 'right', render: (r) => money(r.balance) }]} />
          </Card>
        </>
      )}
    </>
  );
}