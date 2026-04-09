const express = require('express');
const router = express.Router();
const pool = require('../db');
const { sendLock } = require('../services/fcm');

/**
 * POST /webhooks/payment-due/receive
 *
 * Receives a payment-due webhook from Chronex Technologies.
 * Looks up the device by IMEI (device_id), then sends an FCM LOCK
 * push notification to alert the user of an overdue payment.
 *
 * Required Body:
 *   { "device_id": "IMEI_NUMBER" }
 *
 * Optional Header:
 *   X-Webhook-Token: your-secret-token
 *
 * Curl test:
 *   curl -X POST http://localhost:3000/webhooks/payment-due/receive \
 *     -H "Content-Type: application/json" \
 *     -H "X-Webhook-Token: your-secret-token" \
 *     -d '{"device_id":"356938035643809"}'
 */
router.post('/payment-due/receive', async (req, res) => {

    // ── Optional: Verify webhook token ───────────────────────────
    const webhookToken = req.headers['x-webhook-token'];
    if (process.env.CHRONEX_WEBHOOK_TOKEN && webhookToken !== process.env.CHRONEX_WEBHOOK_TOKEN) {
        console.warn('[Webhook] 401 — Invalid or missing X-Webhook-Token.');
        return res.status(401).json({ status: false, message: 'Unauthorized.' });
    }

    const { device_id } = req.body;

    if (!device_id) {
        return res.status(400).json({ status: false, message: 'device_id is required.' });
    }

    console.log(`[Webhook] Payment-due received for device_id=${device_id}`);

    try {
        // ── Look up device by IMEI / device_id ───────────────────
        const result = await pool.query(
            `SELECT device_id, fcm_token, amount_due, is_locked
             FROM devices WHERE device_id = $1`,
            [device_id]
        );

        if (result.rowCount === 0) {
            console.warn(`[Webhook] Device not found: device_id=${device_id}`);
            // Still return 200 so Chronex doesn't retry endlessly
            return res.status(200).json({ status: true, message: 'received' });
        }

        const device = result.rows[0];

        // ── Mark device as locked in DB ───────────────────────────
        await pool.query(
            `UPDATE devices SET is_locked = TRUE, updated_at = NOW() WHERE device_id = $1`,
            [device_id]
        );

        // ── Send FCM LOCK push if token available ─────────────────
        if (device.fcm_token) {
            const amountDue = parseFloat(device.amount_due) || 0;
            const paymentUrl = (process.env.PAYMENT_PORTAL_URL ?? '') + `?device=${device_id}`;

            await sendLock(
                device.fcm_token,
                amountDue,
                'Your payment is overdue. Please settle your balance to continue using the device.',
                paymentUrl
            );

            console.log(`[Webhook] FCM LOCK sent to device=${device_id}, amount_due=₦${amountDue}`);
        } else {
            console.warn(`[Webhook] No FCM token for device=${device_id} — skipping push.`);
        }

        // ── Return 200 as required by Chronex ─────────────────────
        return res.status(200).json({ status: true, message: 'received' });

    } catch (err) {
        console.error('[Webhook] Error processing payment-due webhook:', err.message);
        // Return 500 so Chronex retries
        return res.status(500).json({ status: false, message: 'Internal server error.' });
    }
});

module.exports = router;
