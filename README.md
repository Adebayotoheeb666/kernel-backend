# DLS Backend — Setup & API Reference

## Stack
- **Node.js** (v18+) + **Express**
- **PostgreSQL** via [Supabase](https://supabase.com)
- **Firebase Admin SDK** (FCM)

---

## 1. Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Firebase](https://console.firebase.google.com) project with **Cloud Messaging** enabled

---

## 2. Database Setup

In your **Supabase SQL Editor**, paste and run the contents of `src/schema.sql`.

This creates:
- `devices` — registered device records
- `payments` — payment history
- `tamper_events` — anti-tamper security log

---

## 3. Firebase Setup

1. Go to **Firebase Console → Project Settings → Service Accounts**
2. Click **"Generate new private key"** → download the JSON
3. Save it as `firebase-service-account.json` in the `backend/` folder
4. In `.env`, set: `FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json`

> ⚠️ **Never commit `firebase-service-account.json` to Git.** Add it to `.gitignore`.

---

## 4. Environment Variables

```bash
cp .env.example .env
# Fill in DATABASE_URL, FIREBASE_SERVICE_ACCOUNT_PATH, WEBHOOK_SECRET, PAYMENT_PORTAL_URL
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase connection string (from Project Settings → Database) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to your Firebase service account JSON |
| `WEBHOOK_SECRET` | Secret header value for payment webhook authentication |
| `PAYMENT_PORTAL_URL` | Base URL for payment portal |
| `PORT` | HTTP port (default: 3000) |
| `NODE_ENV` | `development` or `production` |

---

## 5. Running the Server

```bash
cd backend
npm install
npm run dev          # development (nodemon, auto-reload)
npm start            # production
```

---

## 6. API Reference

### `POST /v1/register`
Register a new device (called on app first launch).

**Body:**
```json
{
  "device_id": "a1b2c3d4e5f6...",
  "model": "Tecno Spark 8",
  "user_phone": "+2348012345678",
  "fcm_token": "firebase_token_here"
}
```

**Response:**
```json
{ "success": true, "message": "Device registered successfully." }
```

---

### `GET /v1/status/:device_id`
Poll current lock status (called every 4 hours by the app).

**Response:**
```json
{
  "is_locked": false,
  "amount_due": 0.00,
  "message": "Your account is in good standing.",
  "next_due_date": "2026-04-01",
  "payment_url": null
}
```

---

### `POST /v1/payment-callback`
Payment gateway webhook. Unlocks the device after successful payment.

**Headers:** `X-Webhook-Secret: your_secret`

**Body:**
```json
{
  "device_id": "a1b2c3d4e5f6...",
  "amount": 5000.00,
  "reference": "PAY_REF_001"
}
```

**Response:**
```json
{
  "success": true,
  "unlocked": true,
  "new_amount_due": 0,
  "message": "Payment complete. Device unlock command sent."
}
```

---

### `POST /v1/lock-device`
Manually lock a device (admin use only).

**Headers:** `X-Webhook-Secret: your_secret`

**Body:**
```json
{
  "device_id": "a1b2c3d4e5f6...",
  "amount_due": 5000.00,
  "message": "Your device is locked due to overdue payment."
}
```

---

### `POST /v1/tamper`
Records a tamper event from the Android app. Called automatically when admin disable is attempted.

**Body:** `{ "device_id": "...", "event": "ADMIN_DISABLE_ATTEMPTED" }`

---

### `GET /health`
Health check.

**Response:** `{ "status": "ok", "service": "dls-backend", "timestamp": "..." }`

---

## 7. Deployment (Production)

This backend can be deployed to:
- **[Render.com](https://render.com)** — Free Node.js hosting. Set env vars in dashboard.
- **[Railway.app](https://railway.app)** — Easy Node.js + PostgreSQL hosting.
- **[Fly.io](https://fly.io)** — Lightweight container hosting.
- **Your own VPS** — PM2 + Nginx reverse proxy.

> For Render/Railway: connect to Supabase via `DATABASE_URL` from Supabase project settings.

---

## 8. Security Notes

- The `WEBHOOK_SECRET` must stay private. Rotate it if compromised.
- In production, change CORS origins to your specific admin dashboard URL.
- Consider adding JWT auth for admin endpoints.
- Rate limiting is enabled (100 req/15min per IP).
