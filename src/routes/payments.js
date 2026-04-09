const express = require('express');
const router = express.Router();
const pool = require('../db');
const { sendLock, sendUnlock } = require('../services/fcm');

/**
 * POST /v1/payment-callback
 * Webhook endpoint called by the payment gateway after a successful payment.
 *
 * Verifies the webhook secret, records the payment, resets the device's
 * amount_due balance, marks it as unlocked, and sends an FCM unlock push.
 *
 * Body: { device_id, amount, reference }
 * Header: X-Webhook-Secret: <WEBHOOK_SECRET>
 *
 * Example curl:
 *   curl -X POST http://localhost:3000/v1/payment-callback \
 *     -H "Content-Type: application/json" \
 *     -H "X-Webhook-Secret: your_secret_here" \
 *     -d '{"device_id":"abc123","amount":5000,"reference":"REF001"}'
 */
router.post('/payment-callback', async (req, res) => {
    // ── Authenticate the webhook ──────────────────────────────
    const providedSecret = req.headers['x-webhook-secret'];
    if (providedSecret !== process.env.WEBHOOK_SECRET) {
        console.warn('[Payment] 401 — Invalid webhook secret.');
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const { device_id, amount, reference } = req.body;

    if (!device_id || (amount === undefined || amount === null)) {
        return res.status(400).json({ success: false, message: 'device_id and amount are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ── Fetch current device state ────────────────────────
        const deviceResult = await client.query(
            'SELECT is_locked, amount_due, fcm_token FROM devices WHERE device_id = $1 FOR UPDATE',
            [device_id]
        );

        if (deviceResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Device not found.' });
        }

        const device = deviceResult.rows[0];
        const newAmountDue = Math.max(0, parseFloat(device.amount_due) - parseFloat(amount));
        const shouldUnlock = newAmountDue === 0;

        // ── Record the payment ────────────────────────────────
        await client.query(
            `INSERT INTO payments (device_id, amount, reference) VALUES ($1, $2, $3)`,
            [device_id, amount, reference || null]
        );

        // ── Update device lock state ──────────────────────────
        await client.query(
            `UPDATE devices SET amount_due = $1, is_locked = $2, updated_at = NOW() WHERE device_id = $3`,
            [newAmountDue, !shouldUnlock, device_id]
        );

        await client.query('COMMIT');

        console.log(`[Payment] ₦${amount} recorded for device=${device_id}. newDue=₦${newAmountDue}. unlock=${shouldUnlock}`);

        // ── Send FCM push to device ───────────────────────────
        if (device.fcm_token) {
            if (shouldUnlock) {
                await sendUnlock(device.fcm_token);
            } else {
                // Partial payment — update the lock screen with the new amount
                const paymentUrl = (process.env.PAYMENT_PORTAL_URL ?? '') + `?device=${device_id}`;
                await sendLock(
                    device.fcm_token,
                    newAmountDue,
                    `Partial payment received. Remaining balance: ₦${newAmountDue.toLocaleString('en-NG', { minimumFractionDigits: 2 })}.`,
                    paymentUrl
                );
            }
        } else {
            console.warn(`[Payment] No FCM token for device=${device_id} — skipping push.`);
        }

        return res.status(200).json({
            success: true,
            unlocked: shouldUnlock,
            new_amount_due: newAmountDue,
            message: shouldUnlock
                ? 'Payment complete. Device unlock command sent.'
                : `Partial payment recorded. Remaining: ₦${newAmountDue}.`,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Payment] Error processing payment callback:', err.message);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    } finally {
        client.release();
    }
});

/**
 * POST /v1/lock-device (Admin endpoint)
 * Manually lock a device and send FCM push.
 *
 * Body: { device_id, amount_due, message }
 * Header: X-Webhook-Secret: <WEBHOOK_SECRET>
 */
router.post('/lock-device', async (req, res) => {
    const providedSecret = req.headers['x-webhook-secret'];
    if (providedSecret !== process.env.WEBHOOK_SECRET) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const { device_id, amount_due, message } = req.body;
    if (!device_id) {
        return res.status(400).json({ success: false, message: 'device_id is required.' });
    }

    try {
        const result = await pool.query(
            `UPDATE devices SET is_locked = TRUE, amount_due = $1 WHERE device_id = $2
             RETURNING fcm_token`,
            [amount_due || 0, device_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Device not found.' });
        }

        const { fcm_token } = result.rows[0];
        const paymentUrl = (process.env.PAYMENT_PORTAL_URL ?? '') + `?device=${device_id}`;

        if (fcm_token) {
            await sendLock(fcm_token, amount_due || 0, message || 'Your device has been locked due to an overdue payment.', paymentUrl);
        }

        console.log(`[Admin] Manually locked device=${device_id}.`);
        return res.status(200).json({ success: true, message: 'Device lock command sent.' });
    } catch (err) {
        console.error('[Admin Lock] Error:', err.message);
        return res.status(500).json({ success: false });
    }
});

module.exports = router;
