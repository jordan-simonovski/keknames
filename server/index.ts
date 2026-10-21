import express from 'express';
import http from 'node:http';
import path from 'node:path';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { setupRoomHandlers, startIdleSweep } from './rooms';
import { allowedSocketOrigin } from './origin';
import { windowLimiter } from './rate-limit';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  }),
);

app.disable('x-powered-by');

const server = http.createServer(app);
const allowConnection = windowLimiter(120, 60_000);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN ?? false,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  allowRequest: (req, callback) =>
    callback(
      null,
      allowedSocketOrigin(req, ALLOWED_ORIGIN ?? undefined) &&
        io.engine.clientsCount < 2000 &&
        allowConnection(req.socket.remoteAddress ?? 'unknown'),
    ),
  maxHttpBufferSize: 96 * 1024,
  pingTimeout: 20_000,
  pingInterval: 25_000,
});

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
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
server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`keknames running on http://localhost:${PORT}`);
});
