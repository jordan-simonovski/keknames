import express from 'express';
import http from 'node:http';
import path from 'node:path';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { setupRoomHandlers, startIdleSweep } from './rooms';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  }),
);

app.disable('x-powered-by');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN ?? true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 20_000,
  pingInterval: 25_000,
});

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist, { dotfiles: 'ignore' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

io.on('connection', (socket) => {
  setupRoomHandlers(io, socket);
});

startIdleSweep(io);

const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => {
  console.log(`keknames running on http://localhost:${PORT}`);
});
