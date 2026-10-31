import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

const STAFF_NAV = [
  { group: 'Overview', items: [['/', 'Dashboard']] },
  { group: 'Sales', items: [['/subscriptions', 'Subscriptions'], ['/templates', 'Quotation templates'], ['/customers', 'Customers']] },
  { group: 'Billing', items: [['/invoices', 'Invoices'], ['/payments', 'Payments']] },
  { group: 'Catalog', items: [['/products', 'Products'], ['/plans', 'Plans'], ['/pricing-rules', 'Discounts & taxes']] },
  { group: 'Admin', adminOnly: true, items: [['/team', 'Team']] },
];
const CUSTOMER_NAV = [{ group: 'My account', items: [['/', 'My subscriptions'], ['/my/invoices', 'My invoices']] }];

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  useLocation(); // re-render on navigation so the drawer can close
  const nav = (user.role === 'customer' ? CUSTOMER_NAV : STAFF_NAV).filter((g) => !g.adminOnly || user.role === 'admin');

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col bg-brand-dark text-white">
      <div className="px-5 py-5 text-lg font-semibold tracking-tight">Brightloop</div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {nav.map((g) => (
          <div key={g.group}>
            <div className="px-2 pb-1 text-xs text-white/60">{g.group}</div>
            {g.items.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
                className={({ isActive }) => `block rounded px-2.5 py-2 text-sm transition-colors ${isActive ? 'bg-white text-brand-dark font-medium' : 'text-white/85 hover:bg-white/10'}`}>{label}</NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/15 p-4 text-sm">
        <div className="truncate font-medium">{user.name}</div>
        <div className="mb-2 text-xs capitalize text-white/60">{user.role}</div>
        <button onClick={logout} className="rounded border border-white/30 px-3 py-1.5 text-xs hover:bg-white/10">Sign out</button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen md:block">{sidebar}</aside>
      <div className="no-print sticky top-0 z-30 flex items-center justify-between bg-brand-dark px-4 py-3 text-white md:hidden">
        <span className="font-semibold">Brightloop</span>
        <button aria-label="Open menu" aria-expanded={open} className="rounded border border-white/30 px-3 py-1 text-sm" onClick={() => setOpen(true)}>Menu</button>
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-ink/50" />
          <div className="absolute inset-y-0 left-0 w-64" onClick={(e) => e.stopPropagation()}>{sidebar}</div>
        </div>
      )}
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8"><div className="mx-auto max-w-6xl"><Outlet /></div></main>
    </div>
  );
}
