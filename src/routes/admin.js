const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * Middleware: Simple Admin Secret Check
 * (In a real app, use JWT / Auth0 / Supabase Auth)
 */
const adminAuth = (req, res, next) => {
    const secret = req.headers['x-admin-secret'];
    if (secret !== process.env.WEBHOOK_SECRET) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

// Apply auth to all routes in this router
router.use(adminAuth);

/**
 * GET /v1/admin/stats
 * Dashboard overview metrics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM devices) as total_devices,
                (SELECT COUNT(*) FROM devices WHERE is_locked = true) as locked_devices,
                (SELECT COUNT(*) FROM devices WHERE last_seen_at > NOW() - INTERVAL '24 hours') as active_last_24h,
                (SELECT COALESCE(SUM(amount), 0) FROM payments) as total_revenue
        `);
        res.json(stats.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /v1/admin/devices
 * List all devices with search and filters
 */
router.get('/devices', async (req, res) => {
    const { search, filter } = req.query;
    let query = `SELECT * FROM devices`;
    const params = [];

    if (search) {
        query += ` WHERE device_id ILIKE $1 OR model ILIKE $1 OR user_phone ILIKE $1`;
        params.push(`%${search}%`);
    }

    if (filter === 'locked') {
        query += params.length ? ` AND is_locked = true` : ` WHERE is_locked = true`;
    }

    query += ` ORDER BY last_seen_at DESC LIMIT 100`;

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /v1/admin/logs
 * Unified activity feed (tamper events + payments)
 */
router.get('/logs', async (req, res) => {
    try {
        const logs = await pool.query(`
            (SELECT 'payment' as type, device_id, amount as detail, paid_at as timestamp FROM payments)
            UNION ALL
            (SELECT 'tamper' as type, device_id, event_type as detail, occurred_at as timestamp FROM tamper_events)
            ORDER BY timestamp DESC LIMIT 50
        `);
        res.json(logs.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
