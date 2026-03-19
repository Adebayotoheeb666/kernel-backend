-- =============================================================
-- DLS Database Schema (PostgreSQL / Supabase)
-- Run this in: Supabase SQL Editor or via psql
-- =============================================================

-- ── Devices table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id            SERIAL PRIMARY KEY,
    device_id     VARCHAR(64)  UNIQUE NOT NULL,   -- Android ANDROID_ID hash
    model         VARCHAR(128),                   -- Device model (e.g. "Tecno Spark 8")
    user_phone    VARCHAR(20),                    -- Owner phone number
    fcm_token     TEXT,                           -- Firebase push token (refreshed periodically)
    is_locked     BOOLEAN      NOT NULL DEFAULT FALSE,
    amount_due    DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    next_due_date DATE,
    last_seen_at  TIMESTAMPTZ,                    -- Last time the device polled /status
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Payments table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id          SERIAL PRIMARY KEY,
    device_id   VARCHAR(64) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    amount      DECIMAL(12, 2) NOT NULL,
    reference   VARCHAR(128),                    -- Payment gateway reference
    paid_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tamper events table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS tamper_events (
    id          SERIAL PRIMARY KEY,
    device_id   VARCHAR(64) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    event_type  VARCHAR(64) NOT NULL,            -- e.g. ADMIN_DISABLE_ATTEMPTED, ADMIN_DISABLED
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_payments_device_id ON payments(device_id);
CREATE INDEX IF NOT EXISTS idx_tamper_device_id ON tamper_events(device_id);

-- ── Auto-update updated_at on devices ────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS devices_updated_at ON devices;
CREATE TRIGGER devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
