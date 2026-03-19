require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

/**
 * FCM Service
 *
 * Wraps the Firebase Admin SDK for sending high-priority data messages
 * to Android devices.
 */

// ── Initialize Firebase Admin ─────────────────────────────────
let firebaseInitialized = false;

function initFirebase() {
    if (firebaseInitialized) return;

    let credential;

    // Option A: JSON string in env var (good for serverless/containers)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        credential = admin.credential.cert(serviceAccount);
    }
    // Option B: Path to JSON key file
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        if (!fs.existsSync(keyPath)) {
            throw new Error(`Firebase service account file not found: ${keyPath}`);
        }
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        credential = admin.credential.cert(serviceAccount);
    } else {
        throw new Error('No Firebase credentials provided. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON in .env');
    }

    admin.initializeApp({ credential });
    firebaseInitialized = true;
    console.log('[FCM] Firebase Admin initialized.');
}

// ── Send a Lock command ───────────────────────────────────────
/**
 * Sends a high-priority FCM data message to a device's FCM token.
 *
 * @param {string} fcmToken - The device's Firebase registration token
 * @param {'LOCK'|'UNLOCK'|'GRACE_PERIOD'} action - The command to send
 * @param {object} extras - Additional payload fields (amount_due, message, payment_url)
 */
async function sendPush(fcmToken, action, extras = {}) {
    initFirebase();

    if (!fcmToken) {
        throw new Error('FCM token is null — cannot send push notification.');
    }

    const message = {
        token: fcmToken,
        android: {
            priority: 'HIGH',
            ttl: 60 * 60 * 1000, // 1 hour TTL in milliseconds
        },
        data: {
            action,
            amount_due: String(extras.amount_due ?? 0),
            message: extras.message ?? '',
            payment_url: extras.payment_url ?? process.env.PAYMENT_PORTAL_URL ?? '',
        },
    };

    try {
        const response = await admin.messaging().send(message);
        console.log(`[FCM] Push sent — action=${action}, messageId=${response}`);
        return response;
    } catch (err) {
        console.error(`[FCM] Failed to send push — action=${action}:`, err.message);
        throw err;
    }
}

/**
 * Convenience wrappers for common actions.
 */
const sendLock = (fcmToken, amountDue, message, paymentUrl) =>
    sendPush(fcmToken, 'LOCK', { amount_due: amountDue, message, payment_url: paymentUrl });

const sendUnlock = (fcmToken) =>
    sendPush(fcmToken, 'UNLOCK');

const sendGracePeriod = (fcmToken, message) =>
    sendPush(fcmToken, 'GRACE_PERIOD', { message });

module.exports = { sendPush, sendLock, sendUnlock, sendGracePeriod };
