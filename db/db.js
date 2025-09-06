// db.js
// Server-side Supabase client & tiny DB helpers (no app logic here).

const { createClient } = require('@supabase/supabase-js');
const dns = require('node:dns');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // SERVER ONLY (bypasses RLS)

dns.setDefaultResultOrder('ipv4first');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Create one shared client for the process.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Insert a single row and return the inserted record(s).
 * @template T
 * @param {string} table - Table name
 * @param {T | T[]} row - Object or array of objects to insert
 * @returns {Promise<T[]>}
 */
async function insert(table, row) {
    const { data, error } = await supabase.from(table).insert(row).select();
    if (error) throw error;
    return data;
}

/**
 * Upsert (insert or update on conflict) and return affected record(s).
 * @template T
 * @param {string} table - Table name
 * @param {T | T[]} row - Object or array of objects to upsert
 * @param {string|string[]} onConflict - Column(s) that define conflict target
 * @returns {Promise<T[]>}
 */
async function upsert(table, row, onConflict) {
    const { data, error } = await supabase
        .from(table)
        .upsert(row, { onConflict, ignoreDuplicates: false })
        .select();
    if (error) throw error;
    return data;
}

/**
 * Fetch a single row by simple equality filters (first match or null).
 * @param {string} table - Table name
 * @param {Record<string, any>} filters - e.g., { hash: 'abc', email: 'x@y.com' }
 * @param {string[]} [columns=['*']] - Columns to select
 * @returns {Promise<any|null>}
 */
async function findOne(table, filters, columns = ['*']) {
    let query = supabase.from(table).select(columns.join(',')).limit(1);
    for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
    }
    const { data, error } = await query.maybeSingle(); // returns null if none
    if (error) throw error;
    return data || null;
}

/**
 * Fetch many rows with optional filters and limit.
 * @param {string} table
 * @param {Record<string, any>} [filters]
 * @param {number} [limit]
 * @param {string[]} [columns=['*']]
 * @returns {Promise<any[]>}
 */
async function findMany(table, filters = {}, limit, columns = ['*']) {
    let query = supabase.from(table).select(columns.join(','));
    for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
    }
    if (typeof limit === 'number') query = query.limit(limit);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * Update rows by equality filters, returning updated rows.
 * @param {string} table
 * @param {Record<string, any>} filters
 * @param {Record<string, any>} patch
 * @returns {Promise<any[]>}
 */
async function updateWhere(table, filters, patch) {
    let query = supabase.from(table).update(patch);
    for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
    }
    const { data, error } = await query.select();
    if (error) throw error;
    return data;
}

/**
 * Delete rows by equality filters, returning deleted rows.
 * @param {string} table
 * @param {Record<string, any>} filters
 * @returns {Promise<any[]>}
 */
async function deleteWhere(table, filters) {
    let query = supabase.from(table).delete();
    for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
    }
    const { data, error } = await query.select();
    if (error) throw error;
    return data;
}

async function checkConnection(opts = {}) {
    const { table } = opts;
    try {
        if (table) {
            const { error } = await supabase
                .from(table)
                .select('1', { head: true, count: 'exact' })
                .limit(1);
            return { ok: !error, via: 'table-probe', error: error?.message };
        }

        // Fallback: ping PostgREST root (OpenAPI) to confirm reachability & auth
        const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            method: 'GET',
            headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                Accept: 'application/openapi+json',
            },
        });
        return { ok: res.ok, via: 'rest-root', status: res.status };
    } catch (e) {
        return { ok: false, via: 'exception', error: e?.message || String(e) };
    }
}

module.exports = {
    supabase,     // raw client if you need advanced queries
    insert,
    upsert,
    findOne,
    findMany,
    updateWhere,
    deleteWhere,
    checkConnection
};
