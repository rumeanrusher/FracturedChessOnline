// db.js — Postgres connection pool and schema migration.
// Render's free Postgres expires after 90 days. When that happens, spin up
// a new free instance, point DATABASE_URL at it, and redeploy — this file
// will recreate the schema automatically on first boot (IF NOT EXISTS).

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      elo INTEGER NOT NULL DEFAULT 1200,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | accepted | blocked
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, friend_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      white_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      black_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      result VARCHAR(16) NOT NULL, -- white_win | black_win | draw | aborted
      mode VARCHAR(24) NOT NULL DEFAULT 'classic',
      ranked BOOLEAN NOT NULL DEFAULT false,
      elo_white_before INTEGER,
      elo_black_before INTEGER,
      elo_white_after INTEGER,
      elo_black_after INTEGER,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at TIMESTAMPTZ
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_id, to_id, created_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id, status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo DESC);`);

  console.log('[db] schema migration complete');
}

module.exports = { pool, migrate };
