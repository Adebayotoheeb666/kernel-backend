-- =============================================================
-- DLS Seed Data
-- Run this in your Supabase SQL Editor or via psql:
-- \i src/seed.sql
-- =============================================================

-- Clear existing data (optional, use with caution)
-- TRUNCATE devices, payments, tamper_events CASCADE;

-- ── Insert Sample Devices ──────────────────────────────────────
INSERT INTO devices (device_id, model, user_phone, fcm_token, is_locked, amount_due, next_due_date, last_seen_at)
VALUES 
    ('dev_tecno_001', 'Tecno Spark 10 Pro', '+2348011111111', 'sample_fcm_token_1', false, 0.00, '2026-05-01', NOW() - INTERVAL '2 hours'),
    ('dev_samsung_002', 'Samsung Galaxy A14', '+2348022222222', 'sample_fcm_token_2', true, 5000.00, '2026-03-15', NOW() - INTERVAL '1 day'),
    ('dev_infinix_003', 'Infinix Hot 30', '+2348033333333', 'sample_fcm_token_3', false, 2500.00, '2026-04-10', NOW() - INTERVAL '15 minutes'),
    ('dev_iphone_004', 'iPhone 13 (Simulator)', '+2348044444444', NULL, false, 0.00, '2026-05-15', NOW() - INTERVAL '3 days')
ON CONFLICT (device_id) DO NOTHING;

-- ── Insert Sample Payments ─────────────────────────────────────
INSERT INTO payments (device_id, amount, reference, paid_at)
VALUES 
    ('dev_tecno_001', 5000.00, 'ref_001_abc', NOW() - INTERVAL '30 days'),
    ('dev_tecno_001', 5000.00, 'ref_002_def', NOW() - INTERVAL '1 day'),
    ('dev_infinix_003', 2500.00, 'ref_003_ghi', NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ── Insert Sample Tamper Events ────────────────────────────────
INSERT INTO tamper_events (device_id, event_type, occurred_at)
VALUES 
    ('dev_samsung_002', 'ADMIN_DISABLE_ATTEMPTED', NOW() - INTERVAL '1 day'),
    ('dev_samsung_002', 'ADMIN_DISABLED', NOW() - INTERVAL '23 hours'),
    ('dev_infinix_003', 'SIM_REMOVED', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

-- ── Log Summary ───────────────────────────────────────────────
SELECT 'Seed data inserted successfully!' as status;
SELECT count(*) as total_devices FROM devices;
SELECT count(*) as total_payments FROM payments;
SELECT count(*) as total_tamper_events FROM tamper_events;
