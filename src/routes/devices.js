const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * POST /v1/register
 * Registers a new device or updates an existing one.
 *
 * Body: { device_id, model, user_phone, fcm_token }
 * Response: { success, message }
 */
router.post('/register', async (req, res) => {
    const { device_id, model, user_phone, fcm_token } = req.body;

    if (!device_id) {
        return res.status(400).json({ success: false, message: 'device_id is required.' });
    }

    try {
        await pool.query(
            `INSERT INTO devices (device_id, model, user_phone, fcm_token, last_seen_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (device_id) DO UPDATE
             SET model = EXCLUDED.model,
                 user_phone = COALESCE(EXCLUDED.user_phone, devices.user_phone),
                 fcm_token = COALESCE(EXCLUDED.fcm_token, devices.fcm_token),
                 last_seen_at = NOW()`,
            [device_id, model || null, user_phone || null, fcm_token || null]
        );

        console.log(`[Register] Device registered/updated: ${device_id}`);
        return res.status(200).json({ success: true, message: 'Device registered successfully.' });
    } catch (err) {
        console.error('[Register] Error:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

/**
 * GET /v1/status/:device_id
 * Returns the current lock status, amount due, and next due date for a device.
 *
 * Response: { is_locked, amount_due, message, next_due_date, payment_url }
 */
router.get('/status/:device_id', async (req, res) => {
    const { device_id } = req.params;

    try {
        const result = await pool.query(
            `UPDATE devices SET last_seen_at = NOW()
             WHERE device_id = $1
             RETURNING is_locked, amount_due, next_due_date`,
            [device_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                is_locked: false,
                amount_due: 0,
                message: 'Device not registered. Please reinstall the DLS app.',
                next_due_date: null,
                payment_url: null,
            });
        }

        const device = result.rows[0];
        const isLocked = device.is_locked;
        const amountDue = parseFloat(device.amount_due);
        const paymentUrl = process.env.PAYMENT_PORTAL_URL + `?device=${device_id}`;

        let message;
        if (isLocked) {
            message = `Your device is restricted. Outstanding balance: ₦${amountDue.toLocaleString('en-NG', { minimumFractionDigits: 2 })}.`;
        } else if (amountDue > 0) {
            message = `Payment of ₦${amountDue.toLocaleString('en-NG', { minimumFractionDigits: 2 })} is due soon.`;
        } else {
            message = 'Your account is in good standing. Thank you!';
        }

        console.log(`[Status] device=${device_id} locked=${isLocked} amountDue=${amountDue}`);

        return res.status(200).json({
            is_locked: isLocked,
            amount_due: amountDue,
            message,
            next_due_date: device.next_due_date ?? null,
            payment_url: isLocked ? paymentUrl : null,
        });
    } catch (err) {
        console.error('[Status] Error:', err.message);
        return res.status(500).json({ is_locked: false, amount_due: 0, message: 'Server error.', next_due_date: null, payment_url: null });
    }
});

/**
 * POST /v1/tamper
 * Records a tamper event (e.g. admin disable attempted) and optionally locks the device.
 *
 * Body: { device_id, event }
 */
router.post('/tamper', async (req, res) => {
    const { device_id, event } = req.body;
    if (!device_id || !event) {
        return res.status(400).json({ success: false });
    }

    try {
        await pool.query(
            `INSERT INTO tamper_events (device_id, event_type) VALUES ($1, $2)`,
            [device_id, event]
        );
        console.warn(`[Tamper] ⚠ device=${device_id} event=${event}`);
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[Tamper] Error:', err.message);
        return res.status(500).json({ success: false });
    }
});

/**
 * POST /v1/fcm-token
 * Updates the FCM push token for a registered device.
 *
 * Body: { device_id, fcm_token }
 */
router.post('/fcm-token', async (req, res) => {
    const { device_id, fcm_token } = req.body;
    if (!device_id || !fcm_token) {
        return res.status(400).json({ success: false, message: 'device_id and fcm_token are required.' });
    }

    try {
        await pool.query(
            `UPDATE devices SET fcm_token = $1 WHERE device_id = $2`,
            [fcm_token, device_id]
        );
        console.log(`[FCM Token] Updated for device: ${device_id}`);
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[FCM Token] Error:', err.message);
        return res.status(500).json({ success: false });
    }
});

module.exports = router;
