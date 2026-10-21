// Run against a local server: GAME_URL=http://127.0.0.1:3000 npm run test:integration
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('../client/node_modules/socket.io-client');
const url = process.env.GAME_URL || 'http://127.0.0.1:3000';

function waitFor(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(Error(`Timed out: ${event}`));
    }, 4000);
    function handler(value) {
      if (!predicate(value)) return;
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(value);
    }
    socket.on(event, handler);
  });
}

async function connect(t, options = {}) {
  const socket = io(url, { forceNew: true, reconnection: false, transports: ['websocket'], ...options });
  t.after(() => {
    socket.emit('leave-room');
    socket.disconnect();
  });
  socket.on('game-state', (view) => {
    socket.view = view;
  });
  await waitFor(socket, 'connect');
  return socket;
}

test('real WebSocket rejects a foreign Origin', async (t) => {
  const socket = io(url, {
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
    extraHeaders: { Origin: 'https://untrusted.example' },
  });
  t.after(() => socket.disconnect());
  await waitFor(socket, 'connect_error');
  assert.equal(socket.connected, false);
});

test('real multiplayer payload stays secret after forged role changes and reconnect', async (t) => {
  const sockets = [];
  for (let i = 0; i < 4; i++) sockets.push(await connect(t));
  const host = sockets[0];
  const room = await host.timeout(3000).emitWithAck('create-room', { name: 'integration-host' });
  assert.equal(room.error, undefined);
  const identities = [room];
  for (let i = 1; i < 4; i++) {
    identities.push(
      await sockets[i].timeout(3000).emitWithAck('join-room', { code: room.code, name: `integration-${i}` }),
    );
  }
  identities.forEach((id, i) =>
    host.emit('assign-team', {
      targetId: id.playerId,
      team: i < 2 ? 'red' : 'blue',
      role: i % 2 ? 'operative' : 'spymaster',
    }),
  );
  const started = waitFor(sockets[1], 'game-state');
  host.emit('start-game');
  assert.ok((await started).cards.every((c) => c.type === null));

  sockets[1].emit('assign-team', { targetId: identities[1].playerId, role: 'spymaster' });
  const barrier = waitFor(sockets[1], 'chat-message', (m) => m.text === 'barrier');
  sockets[1].emit('send-chat', { text: 'barrier' });
  await barrier;
  const updated = waitFor(sockets[1], 'game-state', (v) => v.players.length === 5);
  const observer = await connect(t);
  await observer.timeout(3000).emitWithAck('join-room', { code: room.code, name: 'integration-observer' });
  const view = await updated;
  assert.equal(view.you.role, 'operative');
  assert.ok(view.cards.every((c) => c.type === null && c.typeVariant === null));

  const replaced = waitFor(sockets[1], 'session-replaced');
  const replacement = io(url, {
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
    extraHeaders: { Cookie: `keknames_session=${identities[1].sessionToken}` },
  });
  t.after(() => {
    replacement.emit('leave-room');
    replacement.disconnect();
  });
  const restored = await waitFor(replacement, 'game-state');
  await replaced;
  assert.equal(restored.you.id, identities[1].playerId);
  assert.ok(restored.cards.every((c) => c.type === null));
});
