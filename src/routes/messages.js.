// routes/messages.js — direct message history (real-time delivery is via Socket.IO;
// these REST routes are for loading history when opening a chat).
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Conversation list — most recent message per contact
router.get('/', async (req, res) => {
  const uid = req.user.id;
  const result = await pool.query(
    `SELECT DISTINCT ON (other_id) other_id, username, body, created_at, from_id, unread_count
     FROM (
       SELECT
         CASE WHEN m.from_id = $1 THEN m.to_id ELSE m.from_id END AS other_id,
         m.body, m.created_at, m.from_id,
         (SELECT count(*) FROM messages m2
          WHERE m2.to_id = $1 AND m2.from_id = CASE WHEN m.from_id = $1 THEN m.to_id ELSE m.from_id END
          AND m2.read_at IS NULL) AS unread_count
       FROM messages m
       WHERE m.from_id = $1 OR m.to_id = $1
       ORDER BY m.created_at DESC
     ) sub
     JOIN users u ON u.id = sub.other_id
     ORDER BY other_id, created_at DESC`,
    [uid]
  );
  res.json({ conversations: result.rows });
});

// Message history with a specific user
router.get('/:userId', async (req, res) => {
  const uid = req.user.id;
  const otherId = parseInt(req.params.userId);
  const result = await pool.query(
    `SELECT id, from_id, to_id, body, created_at, read_at FROM messages
     WHERE (from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)
     ORDER BY created_at ASC LIMIT 200`,
    [uid, otherId]
  );
  // Mark incoming as read
  await pool.query(
    `UPDATE messages SET read_at = now() WHERE from_id = $1 AND to_id = $2 AND read_at IS NULL`,
    [otherId, uid]
  );
  res.json({ messages: result.rows });
});

module.exports = router;
