// index.js — main server entry point.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const { migrate } = require('./db');
const { attachRealtime } = require('./realtime');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const friendRoutes = require('./routes/friends');
const messageRoutes = require('./routes/messages');

const app = express();
const server = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN === '*' || !process.env.CORS_ORIGIN
  ? '*'
  : process.env.CORS_ORIGIN.split(',').map((s) => s.trim());

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// ── TEMPORARY DEBUG ROUTE ──────────────────────────────────────
// Visit /debug-files on your deployed URL to see exactly what files
// Render sees and where __dirname actually points. Remove this route
// once the static-file issue is fixed — it's not meant for production.
app.get('/debug-files', (req, res) => {
  const repoRoot = path.join(__dirname, '..');
  let rootFiles = [];
  let srcFiles = [];
  try { rootFiles = fs.readdirSync(repoRoot); } catch (e) { rootFiles = ['ERROR: ' + e.message]; }
  try { srcFiles = fs.readdirSync(__dirname); } catch (e) { srcFiles = ['ERROR: ' + e.message]; }
  res.json({
    __dirname,
    repoRoot,
    rootFiles,
    srcFiles,
    expectedHtmlPath: path.join(repoRoot, 'Fractured-Chess-5.html'),
    htmlExists: fs.existsSync(path.join(repoRoot, 'Fractured-Chess-5.html')),
  });
});

app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Fractured-Chess-5.html'));
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/messages', messageRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
});
attachRealtime(io);

const PORT = process.env.PORT || 3001;

migrate()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`[server] listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] failed to migrate database, exiting:', err);
    process.exit(1);
  });
