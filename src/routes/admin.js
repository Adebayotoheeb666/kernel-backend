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
            (SELECT 'payment' as type, device_id, CAST(amount AS TEXT) as detail, paid_at as timestamp FROM payments)
            UNION ALL
            (SELECT 'tamper' as type, device_id, CAST(event_type AS TEXT) as detail, occurred_at as timestamp FROM tamper_events)
            ORDER BY timestamp DESC LIMIT 50
        `);
        res.json(logs.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /v1/admin/devices/:deviceId/delete
 * Sends a DELETE command to the device and removes it from the database.
 */
router.post('/devices/:deviceId/delete', async (req, res) => {
    const { deviceId } = req.params;

    try {
        // 1. Get FCM token
        const deviceResult = await pool.query('SELECT fcm_token FROM devices WHERE device_id = $1', [deviceId]);
        if (deviceResult.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        const { fcm_token } = deviceResult.rows[0];

        // 2. Send FCM DELETE command (if token exists)
        if (fcm_token) {
            const { sendDelete } = require('../services/fcm');
            try {
                await sendDelete(fcm_token);
            } catch (fcmErr) {
                console.error(`[Admin] Failed to send delete push to ${deviceId}:`, fcmErr.message);
                // Continue with DB deletion even if push fails (best effort)
            }
        }

        // 3. Delete from DB
        await pool.query('DELETE FROM devices WHERE device_id = $1', [deviceId]);

        console.log(`[Admin] Device ${deviceId} deleted from dashboard.`);
        res.json({ success: true, message: 'Device deletion command sent and record removed.' });
    } catch (err) {
        console.error('[Admin] Delete error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /v1/admin/devices/:deviceId/lock
 * Manually lock a device via admin dashboard.
 */
router.post('/devices/:deviceId/lock', async (req, res) => {
    const { deviceId } = req.params;
    const { amount_due, message } = req.body;

    try {
        const result = await pool.query(
            `UPDATE devices SET is_locked = TRUE, amount_due = $1 WHERE device_id = $2
             RETURNING fcm_token`,
            [amount_due || 0, deviceId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        const { fcm_token } = result.rows[0];
        if (fcm_token) {
            const { sendLock } = require('../services/fcm');
            const paymentUrl = (process.env.PAYMENT_PORTAL_URL ?? '') + `?device=${deviceId}`;
            await sendLock(fcm_token, amount_due || 0, message || 'Manual lock applied.', paymentUrl);
        }

        res.json({ success: true, message: 'Lock command sent' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /v1/admin/devices/:deviceId/unlock
 * Manually unlock a device via admin dashboard.
 */
router.post('/devices/:deviceId/unlock', async (req, res) => {
    const { deviceId } = req.params;

    try {
        const result = await pool.query(
            `UPDATE devices SET is_locked = FALSE, amount_due = 0 WHERE device_id = $1
             RETURNING fcm_token`,
            [deviceId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        const { fcm_token } = result.rows[0];
        if (fcm_token) {
            const { sendUnlock } = require('../services/fcm');
            await sendUnlock(fcm_token);
        }

        res.json({ success: true, message: 'Unlock command sent' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
