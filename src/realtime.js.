// realtime.js — Socket.IO event handling: matchmaking queue, live game sync,
// chat delivery, presence (online/away/offline), and game-end ELO settlement.
//
// Design: the SERVER is authoritative for whose turn it is and what the dice
// rolled, but full chess rule validation (legal moves, check/checkmate) stays
// on the CLIENT for now, same as the local game — the server just relays
// moves between the two players in a room and trusts them. This keeps the
// server simple to ship; if you want anti-cheat later, port the legal-move
// logic from the HTML file into a shared module and validate moves here too.

const { pool } = require('./db');
const { socketAuth } = require('./auth');
const { newRatings } = require('./elo');

// In-memory state (fine for a single server instance; if you ever scale to
// multiple instances you'd move this to Redis).
const queue = []; // [{ socketId, userId, username, elo, mode, ranked }]
const rooms = new Map(); // roomId -> { white: {userId,socketId,username,elo}, black: {...}, mode, ranked, state }
const userSockets = new Map(); // userId -> socketId (latest connection)
const onlineUsers = new Map(); // userId -> { username, status: 'online'|'away' }

function attachRealtime(io) {
  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { id: userId, username } = socket.user;
    userSockets.set(userId, socket.id);
    onlineUsers.set(userId, { username, status: 'online' });
    broadcastPresence();

    socket.on('disconnect', () => {
      if (userSockets.get(userId) === socket.id) {
        userSockets.delete(userId);
        onlineUsers.delete(userId);
        broadcastPresence();
      }
      // Remove from matchmaking queue if they disconnect mid-search
      const qIdx = queue.findIndex((q) => q.userId === userId);
      if (qIdx !== -1) queue.splice(qIdx, 1);
    });

    socket.on('presence:away', () => {
      const u = onlineUsers.get(userId);
      if (u) { u.status = 'away'; broadcastPresence(); }
    });
    socket.on('presence:online', () => {
      const u = onlineUsers.get(userId);
      if (u) { u.status = 'online'; broadcastPresence(); }
    });

    // ── Matchmaking ──────────────────────────────────────────────
    socket.on('queue:join', async ({ mode = 'classic', ranked = true }) => {
      // Remove any stale entry for this user first
      const existingIdx = queue.findIndex((q) => q.userId === userId);
      if (existingIdx !== -1) queue.splice(existingIdx, 1);

      const result = await pool.query('SELECT elo FROM users WHERE id = $1', [userId]);
      const elo = result.rows[0]?.elo ?? 1200;

      const entry = { socketId: socket.id, userId, username, elo, mode, ranked };

      // Try to find an opponent already waiting for the same mode/ranked setting,
      // preferring closest ELO match.
      const candidates = queue
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => q.mode === mode && q.ranked === ranked && q.userId !== userId);

      if (candidates.length) {
        candidates.sort((a, b) => Math.abs(a.q.elo - elo) - Math.abs(b.q.elo - elo));
        const { q: opponent, i } = candidates[0];
        queue.splice(i, 1);
        createRoom(io, entry, opponent, mode, ranked);
      } else {
        queue.push(entry);
        socket.emit('queue:waiting');
      }
    });

    socket.on('queue:leave', () => {
      const idx = queue.findIndex((q) => q.userId === userId);
      if (idx !== -1) queue.splice(idx, 1);
    });

    // ── Direct challenge (friend invite) ────────────────────────
    socket.on('challenge:send', ({ toUserId, mode = 'classic', ranked = false }) => {
      const targetSocketId = userSockets.get(toUserId);
      if (!targetSocketId) {
        socket.emit('challenge:failed', { reason: 'That player is offline.' });
        return;
      }
      io.to(targetSocketId).emit('challenge:incoming', {
        fromUserId: userId, fromUsername: username, mode, ranked,
      });
    });

    socket.on('challenge:accept', async ({ fromUserId, mode = 'classic', ranked = false }) => {
      const fromSocketId = userSockets.get(fromUserId);
      if (!fromSocketId) {
        socket.emit('challenge:failed', { reason: 'That player disconnected.' });
        return;
      }
      const result = await pool.query('SELECT elo FROM users WHERE id = $1', [userId]);
      const elo = result.rows[0]?.elo ?? 1200;
      const a = { socketId: socket.id, userId, username, elo, mode, ranked };
      const b = { socketId: fromSocketId, userId: fromUserId, username: onlineUsers.get(fromUserId)?.username, elo: 1200, mode, ranked };
      createRoom(io, a, b, mode, ranked);
    });

    socket.on('challenge:decline', ({ fromUserId }) => {
      const fromSocketId = userSockets.get(fromUserId);
      if (fromSocketId) io.to(fromSocketId).emit('challenge:declined', { byUserId: userId });
    });

    // ── In-game events ──────────────────────────────────────────
    socket.on('game:move', ({ roomId, move, boardState }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const opponentSocketId = room.white.userId === userId ? room.black.socketId : room.white.socketId;
      io.to(opponentSocketId).emit('game:move', { move, boardState, fromUserId: userId });
    });

    socket.on('game:dice', ({ roomId, pendingMutations }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const opponentSocketId = room.white.userId === userId ? room.black.socketId : room.white.socketId;
      io.to(opponentSocketId).emit('game:dice', { pendingMutations, fromUserId: userId });
    });

    socket.on('game:resign', async ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const winnerIsWhite = room.black.userId === userId;
      await settleMatch(io, room, winnerIsWhite ? 'white_win' : 'black_win');
    });

    socket.on('game:result', async ({ roomId, result }) => {
      // result: 'white_win' | 'black_win' | 'draw'
      const room = rooms.get(roomId);
      if (!room) return;
      await settleMatch(io, room, result);
    });

    // ── Chat ─────────────────────────────────────────────────────
    socket.on('chat:send', async ({ toUserId, body }) => {
      if (!body || !body.trim()) return;
      const trimmed = body.trim().slice(0, 2000);
      const result = await pool.query(
        `INSERT INTO messages (from_id, to_id, body) VALUES ($1, $2, $3)
         RETURNING id, from_id, to_id, body, created_at`,
        [userId, toUserId, trimmed]
      );
      const msg = result.rows[0];
      const targetSocketId = userSockets.get(toUserId);
      if (targetSocketId) io.to(targetSocketId).emit('chat:receive', msg);
      socket.emit('chat:sent', msg);
    });
  });

  function broadcastPresence() {
    const list = Array.from(onlineUsers.entries()).map(([id, v]) => ({ userId: id, ...v }));
    io.emit('presence:update', list);
  }
}

function createRoom(io, a, b, mode, ranked) {
  const roomId = `room_${a.userId}_${b.userId}_${Date.now()}`;
  // Randomize colors
  const aIsWhite = Math.random() < 0.5;
  const white = aIsWhite ? a : b;
  const black = aIsWhite ? b : a;
  rooms.set(roomId, { white, black, mode, ranked, createdAt: Date.now() });

  io.to(white.socketId).emit('match:found', {
    roomId, color: 'w', opponent: { username: black.username, elo: black.elo }, mode, ranked,
  });
  io.to(black.socketId).emit('match:found', {
    roomId, color: 'b', opponent: { username: white.username, elo: white.elo }, mode, ranked,
  });
}

async function settleMatch(io, room, result) {
  const { white, black, mode, ranked } = room;

  let winnerId = null;
  let resultAWhite; // 1, 0, or 0.5 from white's perspective
  if (result === 'white_win') { winnerId = white.userId; resultAWhite = 1; }
  else if (result === 'black_win') { winnerId = black.userId; resultAWhite = 0; }
  else { resultAWhite = 0.5; }

  let eloWhiteAfter = white.elo;
  let eloBlackAfter = black.elo;

  if (ranked) {
    const { newA, newB } = newRatings(white.elo, black.elo, resultAWhite);
    eloWhiteAfter = newA;
    eloBlackAfter = newB;
    await pool.query('UPDATE users SET elo = $1 WHERE id = $2', [newA, white.userId]);
    await pool.query('UPDATE users SET elo = $1 WHERE id = $2', [newB, black.userId]);
  }

  const statCol = result === 'white_win' ? ['wins', 'losses']
    : result === 'black_win' ? ['losses', 'wins']
    : ['draws', 'draws'];
  await pool.query(`UPDATE users SET ${statCol[0]} = ${statCol[0]} + 1 WHERE id = $1`, [white.userId]);
  await pool.query(`UPDATE users SET ${statCol[1]} = ${statCol[1]} + 1 WHERE id = $1`, [black.userId]);

  await pool.query(
    `INSERT INTO matches (white_id, black_id, winner_id, result, mode, ranked,
       elo_white_before, elo_black_before, elo_white_after, elo_black_after, ended_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())`,
    [white.userId, black.userId, winnerId, result, mode, ranked, white.elo, black.elo, eloWhiteAfter, eloBlackAfter]
  );

  const payload = {
    result, eloWhiteAfter, eloBlackAfter,
    eloWhiteDelta: eloWhiteAfter - white.elo, eloBlackDelta: eloBlackAfter - black.elo,
  };
  io.to(white.socketId).emit('game:ended', payload);
  io.to(black.socketId).emit('game:ended', payload);

  for (const [id, r] of rooms) {
    if (r === room) { rooms.delete(id); break; }
  }
}

module.exports = { attachRealtime };
