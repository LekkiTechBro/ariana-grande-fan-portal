# NOVA Fan Portal — Full Stack

A complete celebrity fan portal with backend, admin dashboard, and multi-currency support.

---

## Project Structure

```
nova-portal/
├── server.py          ← Flask backend + REST API
├── requirements.txt   ← Python dependencies
├── nova.db            ← SQLite database (auto-created on first run)
│
├── index.html         ← Fan-facing frontend
├── index.css          ← All styles
├── index.js           ← Frontend logic (API-connected)
│
└── admin.html         ← Admin dashboard (full CRUD)
```

---

## Quick Start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the server
```bash
python3 server.py
```

### 3. Open in browser
- **Fan Portal:**   http://localhost:5000
- **Admin Panel:**  http://localhost:5000/admin

---

## Admin Credentials

| Field    | Default       |
|----------|---------------|
| Username | `admin`       |
| Password | `nova2026!`   |

> **Change these before going live!**
> Set environment variables: `NOVA_ADMIN_USER` and `NOVA_ADMIN_PASS`

---

## Environment Variables

| Variable          | Default                    | Description                |
|-------------------|----------------------------|----------------------------|
| `NOVA_SECRET`     | `nova-super-secret-...`    | JWT signing secret         |
| `NOVA_ADMIN_USER` | `admin`                    | Admin login username       |
| `NOVA_ADMIN_PASS` | `nova2026!`                | Admin login password       |
| `PORT`            | `5000`                     | Server port                |

Example:
```bash
NOVA_SECRET=my-long-random-secret NOVA_ADMIN_PASS=StrongPass123 python3 server.py
```

---

## REST API Endpoints

### Public
| Method | Path                  | Description                        |
|--------|-----------------------|------------------------------------|
| GET    | `/api/events`         | All active events                  |
| GET    | `/api/payment-info`   | Bank details + wallet addresses    |
| POST   | `/api/bookings`       | Create a new booking               |

### Admin (JWT required)
| Method | Path                              | Description                     |
|--------|-----------------------------------|---------------------------------|
| POST   | `/api/admin/login`                | Get JWT token                   |
| GET    | `/api/admin/stats`                | Dashboard stats                 |
| GET    | `/api/admin/events`               | All events (incl. hidden)       |
| POST   | `/api/admin/events`               | Create event                    |
| PUT    | `/api/admin/events/:id`           | Update event                    |
| DELETE | `/api/admin/events/:id`           | Hide event (soft delete)        |
| PATCH  | `/api/admin/events/:id/restore`   | Restore hidden event            |
| GET    | `/api/admin/payment-settings`     | All payment settings            |
| PUT    | `/api/admin/payment-settings`     | Bulk update payment settings    |
| GET    | `/api/admin/bookings`             | All bookings                    |
| PATCH  | `/api/admin/bookings/:id/status`  | Update booking status           |
| GET    | `/api/admin/log`                  | Admin activity log              |

---

## What Admins Can Manage

### Events
- Create, edit, hide/restore events
- Set title, date, venue, city, country, badge type
- Set ticket price (USD) and capacity
- Sold count tracked automatically on booking

### Payment Settings (per currency)
- **NGN/Local**: Account name, number, bank, sort code, SWIFT, IBAN
- **USD Wire**: Bank, account, routing, SWIFT
- **GBP**: Bank, account, sort code
- **EUR**: Bank, IBAN, BIC
- **Crypto**: Bitcoin (BTC), Ethereum (ETH), USDT (TRC-20) wallets

All payment details are served via `/api/payment-info` and rendered live on the fan portal.

### Bookings
- View all bookings with filter by status
- Update status: pending → confirmed / paid / cancelled

---

## Production Notes

1. Use a strong `NOVA_SECRET` (32+ random chars)
2. Change admin credentials via env vars
3. Put behind nginx/caddy as a reverse proxy
4. Enable HTTPS (required for payments)
5. For real payments: integrate Paystack, Stripe, or a BTC payment processor

---

## Currency Support

The frontend supports 4 currencies:
- **USD** — US Dollar
- **GBP** — British Pound
- **EUR** — Euro
- **BTC** — Bitcoin

Bank account details shown to fans automatically match the selected currency.
Bitcoin wallet address is pulled live from the database (admin-editable).

---

## Deploying to Render

### One-click deploy
1. Push this folder to a **GitHub repository**
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` and configures everything

### Manual setup on Render dashboard
| Field | Value |
|---|---|
| **Runtime** | Python 3 |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `gunicorn server:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120` |

### Environment variables to set in Render dashboard
| Variable | Value |
|---|---|
| `AG_SECRET` | Any long random string (Render can auto-generate) |
| `AG_ADMIN_USER` | `admin` (or your choice) |
| `AG_ADMIN_PASS` | A strong password |
| `RENDER` | `true` |

### Important: Database persistence
The free Render tier uses an **ephemeral filesystem** — `ag.db` lives in `/tmp`
and resets on each deploy. To keep data across deploys:
- **Option A (recommended free):** Add a Render Disk (500 MB free) and set
  `DB_PATH` env var to `/var/data/ag.db`
- **Option B:** Upgrade to Render's managed PostgreSQL

### Local development (unchanged)
```bash
pip install -r requirements.txt
python3 server.py
```
