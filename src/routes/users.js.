// routes/users.js — profile, leaderboard, match history.
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// Current user's profile
router.get('/me', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, username, elo, wins, losses, draws, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ user: result.rows[0] });
});

// Public profile lookup
router.get('/:username', async (req, res) => {
  const result = await pool.query(
    'SELECT id, username, elo, wins, losses, draws, last_seen FROM users WHERE username = $1',
    [req.params.username]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ user: result.rows[0] });
});

// Leaderboard — top players by ELO
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const result = await pool.query(
    `SELECT id, username, elo, wins, losses, draws
     FROM users ORDER BY elo DESC LIMIT $1`,
    [limit]
  );
  res.json({ players: result.rows });
});

// This user's match history
router.get('/me/matches', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT m.id, m.result, m.mode, m.ranked, m.started_at, m.ended_at,
            wu.username AS white_username, bu.username AS black_username,
            m.elo_white_before, m.elo_white_after, m.elo_black_before, m.elo_black_after
     FROM matches m
     LEFT JOIN users wu ON wu.id = m.white_id
     LEFT JOIN users bu ON bu.id = m.black_id
     WHERE m.white_id = $1 OR m.black_id = $1
     ORDER BY m.started_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ matches: result.rows });
});

module.exports = router;
