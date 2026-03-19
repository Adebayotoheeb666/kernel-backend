require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const deviceRoutes = require('./routes/devices');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');

const app = express();

// ── Security Middleware ───────────────────────────────────────
app.use(helmet());
app.use(cors({
    // Restrict to your admin dashboard origin in production
    origin: process.env.NODE_ENV === 'production'
        ? ['https://admin.yourdomain.com']
        : '*',
}));

// ── Rate Limiting ─────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // max 100 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use(limiter);

// ── Body Parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request Logging (simple) ──────────────────────────────────
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
    });
    next();
});

// ── Routes ────────────────────────────────────────────────────
app.use('/v1', deviceRoutes);
app.use('/v1', paymentRoutes);
app.use('/v1/admin', adminRoutes);

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'dls-backend',
        timestamp: new Date().toISOString(),
    });
});

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Error]', err.message);
    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production'
            ? 'Internal server error.'
            : err.message,
    });
});

module.exports = app;
