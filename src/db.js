const { Pool } = require('pg');
const dns = require('dns');

// Force IPv4 — Supabase resolves to both IPv4 and IPv6, but many
// local environments (like Kali Linux VMs) don't have IPv6 routing.
dns.setDefaultResultOrder('ipv4first');

/**
 * PostgreSQL connection pool.
 * Connects to Supabase (or any PostgreSQL host) via the DATABASE_URL env var.
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        // Required for Supabase pooler connections.
        // Set to true only if you have a proper CA cert in production.
        rejectUnauthorized: false,
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});

module.exports = pool;
