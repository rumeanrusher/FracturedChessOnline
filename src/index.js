// index.js — main server entry point.
require('dotenv').config();

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
app.use(cors());
const server = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN === '*' || !process.env.CORS_ORIGIN
  ? '*'
  : process.env.CORS_ORIGIN.split(',').map((s) => s.trim());

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'fractured-chess-server' });
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
