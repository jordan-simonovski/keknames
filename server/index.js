const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { setupRoomHandlers } = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

io.on('connection', (socket) => {
  setupRoomHandlers(io, socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`keknames running on http://localhost:${PORT}`);
});
