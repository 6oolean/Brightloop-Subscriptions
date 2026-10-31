import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import { Login, Signup, ForgotPassword, ResetPassword } from './pages/AuthPages';
import Dashboard from './pages/Dashboard';
import Subscriptions from './pages/Subscriptions';
import SubscriptionForm from './pages/SubscriptionForm';
import SubscriptionDetail from './pages/SubscriptionDetail';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Payments from './pages/Payments';
import Customers from './pages/Customers';
import { Products, Plans, PricingRules, Templates, Team } from './pages/Catalog';
import { MySubscriptions, MyInvoices } from './pages/Portal';

const Guard = ({ roles, children }) => {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
};
const staff = ['admin', 'staff'];

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return (
    <Routes>
      <Route path="/login" element={<Login />} /><Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} /><Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
  const isCustomer = user.role === 'customer';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={isCustomer ? <MySubscriptions /> : <Dashboard />} />
        <Route path="my/invoices" element={<Guard roles={['customer']}><MyInvoices /></Guard>} />
        <Route path="my/invoices/:id" element={<Guard roles={['customer']}><InvoiceDetail portal /></Guard>} />
        <Route path="subscriptions" element={<Guard roles={staff}><Subscriptions /></Guard>} />
        <Route path="subscriptions/new" element={<Guard roles={staff}><SubscriptionForm /></Guard>} />
        <Route path="subscriptions/:id" element={<Guard roles={staff}><SubscriptionDetail /></Guard>} />
        <Route path="invoices" element={<Guard roles={staff}><Invoices /></Guard>} />
        <Route path="invoices/:id" element={<Guard roles={staff}><InvoiceDetail /></Guard>} />
        <Route path="payments" element={<Guard roles={staff}><Payments /></Guard>} />
        <Route path="customers" element={<Guard roles={staff}><Customers /></Guard>} />
        <Route path="products" element={<Guard roles={staff}><Products /></Guard>} />
        <Route path="plans" element={<Guard roles={staff}><Plans /></Guard>} />
        <Route path="pricing-rules" element={<Guard roles={staff}><PricingRules /></Guard>} />
        <Route path="templates" element={<Guard roles={staff}><Templates /></Guard>} />
        <Route path="team" element={<Guard roles={['admin']}><Team /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
