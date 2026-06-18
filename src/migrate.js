// migrate.js — run schema migration standalone (npm run migrate).
// Useful for first deploy or after rotating to a fresh Postgres instance.
require('dotenv').config();
const { migrate, pool } = require('./db');

migrate()
  .then(() => {
    console.log('[migrate] done');
    return pool.end();
  })
  .catch((err) => {
    console.error('[migrate] failed:', err);
    process.exit(1);
  });
