# Fractured Chess — Server

Backend for online multiplayer: accounts, friends, ELO, match history, live
game sync, and chat. Built with Express + Socket.IO + Postgres.

## Deploying to Render (free tier)

**Option A — one-click via Blueprint (recommended)**

1. Push this folder to a GitHub repo.
2. In the Render dashboard: **New +** → **Blueprint** → connect the repo.
   Render reads `render.yaml` and provisions both the web service and the
   free Postgres database automatically, wiring `DATABASE_URL` for you.
3. Wait for the first deploy to finish. Visit `https://<your-service>.onrender.com/health`
   — you should see `{"status":"ok"}`.

**Option B — manual setup**

1. In Render: **New +** → **PostgreSQL**. Free tier. Copy the **Internal
   Database URL** once it's ready.
2. **New +** → **Web Service** → connect your repo.
   - Build command: `npm install`
   - Start command: `npm start`
   - Add environment variables:
     - `DATABASE_URL` = the internal connection string from step 1
     - `JWT_SECRET` = any long random string
     - `CORS_ORIGIN` = `*` (or your frontend's URL once you have one)
3. Deploy. Check `/health`.

### Important: free Postgres expires after 90 days

Render's free Postgres plan is deleted 90 days after creation — this is a
hard limit, not a typo. Before it expires:

1. Create a new free Postgres instance.
2. Update `DATABASE_URL` on the web service to point to it.
3. Redeploy — `migrate()` runs automatically on boot and recreates the schema.

This **does not migrate existing data** — accounts, ELO, and match history
on the old database are lost unless you manually export/import them (Render
gives you a `pg_dump`-compatible connection string; run
`pg_dump $OLD_URL | psql $NEW_URL` from any machine with `psql` installed
before the old one expires). If you outgrow the free tier or want this to
just not be a recurring chore, upgrade to Render's $7/mo Postgres plan —
no code changes needed, just swap the connection string.

## Local development

```bash
cp .env.example .env
# edit .env with a local Postgres URL, or use a free Render/Neon/Supabase instance
npm install
npm run migrate   # creates tables
npm run dev       # starts the server on PORT (default 3001)
```

## REST API

All authenticated routes expect `Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | `{username, password}` → `{token, user}` |
| POST | `/api/auth/login` | — | `{username, password}` → `{token, user}` |
| GET | `/api/users/me` | ✓ | Current user's profile |
| GET | `/api/users/:username` | — | Public profile lookup |
| GET | `/api/users?limit=50` | — | Leaderboard, sorted by ELO |
| GET | `/api/users/me/matches` | ✓ | Match history |
| GET | `/api/friends` | ✓ | Friends + pending requests |
| POST | `/api/friends/request` | ✓ | `{username}` → send friend request |
| POST | `/api/friends/accept/:requestId` | ✓ | Accept incoming request |
| DELETE | `/api/friends/:requestId` | ✓ | Remove friend / cancel / decline request |
| GET | `/api/messages` | ✓ | Conversation list with last message + unread count |
| GET | `/api/messages/:userId` | ✓ | Message history with one user (marks as read) |

## Socket.IO events

Connect with `io(SERVER_URL, { auth: { token } })`.

**Client → Server**

| Event | Payload | Description |
|---|---|---|
| `queue:join` | `{mode, ranked}` | Join matchmaking queue |
| `queue:leave` | — | Leave queue |
| `challenge:send` | `{toUserId, mode, ranked}` | Invite a specific friend |
| `challenge:accept` | `{fromUserId, mode, ranked}` | Accept an invite |
| `challenge:decline` | `{fromUserId}` | Decline an invite |
| `game:move` | `{roomId, move, boardState}` | Relay a move to opponent |
| `game:dice` | `{roomId, pendingMutations}` | Relay dice roll result |
| `game:resign` | `{roomId}` | Resign current game |
| `game:result` | `{roomId, result}` | Report game end (`white_win`/`black_win`/`draw`) |
| `chat:send` | `{toUserId, body}` | Send a direct message |
| `presence:away` / `presence:online` | — | Update your status |

**Server → Client**

| Event | Payload | Description |
|---|---|---|
| `queue:waiting` | — | You're in queue, waiting for opponent |
| `match:found` | `{roomId, color, opponent, mode, ranked}` | Match found, game starting |
| `challenge:incoming` | `{fromUserId, fromUsername, mode, ranked}` | Someone challenged you |
| `challenge:declined` | `{byUserId}` | Your challenge was declined |
| `challenge:failed` | `{reason}` | Challenge couldn't be delivered |
| `game:move` | `{move, boardState, fromUserId}` | Opponent moved |
| `game:dice` | `{pendingMutations, fromUserId}` | Opponent's dice result |
| `game:ended` | `{result, eloWhiteAfter, eloBlackAfter, ...}` | Match settled |
| `chat:receive` | `{id, from_id, to_id, body, created_at}` | New incoming message |
| `chat:sent` | same shape | Confirms your message was saved |
| `presence:update` | `[{userId, username, status}]` | Full online users list |

## Architecture notes for whoever picks this up later

- Move validation happens **client-side only** right now — the server just
  relays whatever move/dice payload one client sends to the other. This is
  fine for a friends-and-family launch but means a modified client could
  cheat. If that becomes a problem, port the legal-move logic from the game's
  HTML file into a shared module both the client and `realtime.js` import,
  and validate `game:move` against it before relaying.
- Matchmaking and room state live in plain JS `Map`/array in `realtime.js`
  — fine for one server instance. If you ever need to run multiple instances
  behind a load balancer, this state needs to move to Redis (or Socket.IO's
  Redis adapter) or players on different instances won't find each other.
- ELO uses a K-factor of 32 (`src/elo.js`) — standard for casual platforms.
  Lower it once you have a real player base if ratings feel too volatile.
