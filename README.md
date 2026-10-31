# Brightloop Subscriptions

Plans, subscriptions, recurring invoicing, payments and revenue reporting in one place. Built local-first: SQLite database, no cloud services, no CDN. It works with the network unplugged.

## Run it

```bash
npm run install:all
npm run seed            # demo data (30 customers); `npm run seed:big` = 5,000 subscriptions
npm run dev:server      # API on :4000   (terminal 1)
npm run dev:client      # UI on :5173    (terminal 2)
```

Single-process demo: `npm run build && npm start`, then open http://localhost:4000.

| Role | Login | Password |
|---|---|---|
| Admin | admin@brightloop.test | Admin@1234 |
| Staff | staff@brightloop.test | Admin@1234 |
| Customer | customer@brightloop.test | Admin@1234 |

Password-reset emails are written to `server/outbox/` and printed in the server console. Set `SMTP_URL` to send real mail.

## Stack and why

| Piece | Choice | Reason |
|---|---|---|
| API | Express 5 | Small and easy to explain |
| Database | SQLite via better-sqlite3 | Real SQL, indexes and transactions with zero setup |
| Validation | zod on the server, mirrored rules in forms | The server is the authority; the UI gives instant feedback |
| Auth | JWT + bcrypt, role middleware | Admin / Staff / Customer |
| UI | React, Vite, Tailwind, Recharts | One token palette, responsive layout, dashboard chart |
| Fonts | @fontsource (bundled) | No CDN needed |

## How the important rules are enforced

- **No double billing.** `invoices` has `UNIQUE(subscription_id, period_start)`. The engine also checks first, bills each subscription in its own transaction, and advances `next_invoice_date`. Re-running, double-clicking or two admins billing at once cannot create a duplicate, and a skipped period is caught up on the next run (`server/src/billing.js`).
- **Discounts apply themselves.** At invoice time the engine finds active discounts in their date window with uses left, checks minimum quantity and purchase, applies them as negative lines, charges tax on the discounted amount, and increments `times_used` in the same transaction. Product discounts match lines automatically; subscription discounts are chosen on the subscription.
- **Prices cannot be forged.** The server computes `unit_price = product price + variant extra` (Odoo brand = +560). Any price sent by the browser is ignored.
- **Status machines** live in one map each (`TRANSITIONS` in `routes/sales.js`, `INV_TRANSITIONS` in `routes/finance.js`). Illegal moves return 409. Plan flags (`allow_pause`, `allow_renew`, `allow_early_close`, `auto_close`) are checked on transition and during billing.
- **Overdue is computed**, never stored: `status = 'confirmed' AND due_date < today`.
- **Payments** are recorded against confirmed invoices, cannot exceed the balance, and flip the invoice to Paid when it is fully settled.
- **RBAC.** Admin only: staff creation, products, plans, taxes, discounts, templates. Staff: customers, subscriptions, invoices, payments. Customers: `/me/*` only, and identity always comes from the token, never the URL.
- **Passwords:** more than 8 characters with upper, lower and special character. Emails are unique (database constraint plus check). Reset tokens are stored hashed, expire in 30 minutes and work once.

## Speed

Every list is paginated server-side and dashboard figures are SQL aggregates, backed by indexes on `subscriptions(status, next_invoice_date)`, `invoices(status, due_date)`, `invoices(customer_id)` and `payments(invoice_id)`. With 5,000 subscriptions and about 11,600 invoices, every endpoint answered in under 25 ms locally and a billing run of 373 invoices took about 70 ms.

## Tests

`npm test` runs 10 API tests: password rules, unique email, RBAC, reset flow, server-side pricing, idempotent billing, catch-up, discount limits, payment settlement and portal isolation.

## API (`/api/v1`)

Auth: `POST /auth/signup | login | forgot-password | reset-password`, `GET /auth/me`, `POST|GET /auth/staff` (admin)
Catalog: `/products`, `/products/:id/variants`, `/variants`, `/plans`, `/taxes`, `/discounts`, `/customers`, `/quotation-templates`
Sales: `/subscriptions`, `POST /subscriptions/:id/transition | renew`
Billing: `POST /billing/run`, `/invoices`, `POST /invoices/:id/confirm | cancel | send`, `POST /invoices/confirm-all`, `POST /invoices/:id/payments`, `/payments`
Reports: `GET /reports/summary`, `/reports/overdue`
Portal: `GET /me/subscriptions`, `/me/invoices`, `/me/invoices/:id`