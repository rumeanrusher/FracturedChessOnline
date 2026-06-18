// routes/friends.js — friend requests, acceptance, listing.
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// List friends (accepted) and pending requests (incoming + outgoing)
router.get('/', async (req, res) => {
  const uid = req.user.id;

  const accepted = await pool.query(
    `SELECT u.id, u.username, u.elo, u.last_seen
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
     WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'`,
    [uid]
  );

  const incoming = await pool.query(
    `SELECT f.id AS request_id, u.id, u.username, u.elo
     FROM friendships f JOIN users u ON u.id = f.user_id
     WHERE f.friend_id = $1 AND f.status = 'pending'`,
    [uid]
  );

  const outgoing = await pool.query(
    `SELECT f.id AS request_id, u.id, u.username, u.elo
     FROM friendships f JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = $1 AND f.status = 'pending'`,
    [uid]
  );

  res.json({
    friends: accepted.rows,
    incomingRequests: incoming.rows,
    outgoingRequests: outgoing.rows,
  });
});

// Send a friend request by username
router.post('/request', async (req, res) => {
  const uid = req.user.id;
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    const target = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });
    const friendId = target.rows[0].id;
    if (friendId === uid) return res.status(400).json({ error: "You can't friend yourself" });

    // If the other person already sent us a request, auto-accept instead of duplicating
    const reverse = await pool.query(
      `SELECT id FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
      [friendId, uid]
    );
    if (reverse.rows[0]) {
      await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [reverse.rows[0].id]);
      return res.json({ status: 'accepted' });
    }

    await pool.query(
      `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'pending')
       ON CONFLICT (user_id, friend_id) DO NOTHING`,
      [uid, friendId]
    );
    res.json({ status: 'pending' });
  } catch (err) {
    console.error('[friends/request] error:', err);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Accept an incoming friend request
router.post('/accept/:requestId', async (req, res) => {
  const uid = req.user.id;
  const result = await pool.query(
    `UPDATE friendships SET status = 'accepted'
     WHERE id = $1 AND friend_id = $2 AND status = 'pending' RETURNING id`,
    [req.params.requestId, uid]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Request not found' });
  res.json({ status: 'accepted' });
});

// Decline/cancel/remove a friendship or request
router.delete('/:requestId', async (req, res) => {
  const uid = req.user.id;
  await pool.query(
    `DELETE FROM friendships WHERE id = $1 AND (user_id = $2 OR friend_id = $2)`,
    [req.params.requestId, uid]
  );
  res.json({ status: 'removed' });
});

module.exports = router;
