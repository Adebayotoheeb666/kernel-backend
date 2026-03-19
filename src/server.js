require('dotenv').config();

const app = require('./app');
const pool = require('./db');

const PORT = process.env.PORT || 3000;

async function start() {
    try {
        // ── Verify database connectivity ──────────────────────
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log(`[DB] Connected to PostgreSQL at ${result.rows[0].now}`);

        // ── Start HTTP server ─────────────────────────────────
        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════════╗
║          DLS Backend Server — Running                    ║
╠══════════════════════════════════════════════════════════╣
║  Port    : ${String(PORT).padEnd(46)}║
║  Mode    : ${String(process.env.NODE_ENV || 'development').padEnd(46)}║
║  Health  : http://localhost:${PORT}/health${' '.repeat(26 - String(PORT).length)}║
╚══════════════════════════════════════════════════════════╝
            `);
        });
    } catch (err) {
        console.error('[Server] Failed to start:', err.message);
        process.exit(1);
    }
}

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGTERM', async () => {
    console.log('[Server] SIGTERM received — shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[Server] SIGINT received — shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

start();
