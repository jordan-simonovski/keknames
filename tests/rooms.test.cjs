const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupRoomHandlers, startIdleSweep } = require('../dist/server/rooms');

// Exercise the real socket handlers and personalized outbound payloads without a port.
function harness(t) {
  const sockets = new Map();
  const io = {
    sockets: { sockets },
    to(target) {
      return {
        emit(event, data) {
          for (const socket of sockets.values()) {
            if (socket.id === target || socket.rooms.has(target)) socket.emit(event, data);
          }
        },
      };
    },
  };
  let sequence = 0;
  function connect(token) {
    const handlers = new Map();
    const events = [];
    const socket = {
      id: `socket-${++sequence}`,
      rooms: new Set(),
      handshake: { address: `${t.name}-${sequence}`, headers: { cookie: token ? `keknames_session=${token}` : '' } },
      on: (event, handler) => handlers.set(event, handler),
      emit: (event, data) => events.push({ event, data: structuredClone(data) }),
      join(room) {
        this.rooms.add(room);
      },
      leave(room) {
        this.rooms.delete(room);
      },
      disconnect() {
        handlers.get('disconnect')?.();
        sockets.delete(this.id);
      },
      send(event, data) {
        let reply;
        handlers.get(event)?.(data, (r) => {
          reply = r;
        });
        return reply;
      },
      last(event) {
        return events.findLast((e) => e.event === event)?.data;
      },
    };
    sockets.set(socket.id, socket);
    setupRoomHandlers(io, socket);
    return socket;
  }
  t.after(() => {
    for (const s of sockets.values()) s.send('leave-room');
  });
  function lobby() {
    const clients = Array.from({ length: 4 }, () => connect());
    const identities = [clients[0].send('create-room', { name: 'host' })];
    for (let i = 1; i < 4; i++)
      identities.push(clients[i].send('join-room', { code: identities[0].code, name: `p${i}` }));
    identities.forEach((id, i) =>
      clients[0].send('assign-team', {
        targetId: id.playerId,
        team: i < 2 ? 'red' : 'blue',
        role: i % 2 ? 'operative' : 'spymaster',
      }),
    );
    return { clients, identities, host: clients[0], code: identities[0].code };
  }
  function classic() {
    const room = lobby();
    room.host.send('start-game');
    return room;
  }
  return { connect, lobby, classic, io };
}

test('operative cannot promote itself during a game and obtain the secret key', (t) => {
  const h = harness(t);
  const { clients, identities, code } = h.classic();
  clients[1].send('assign-team', { targetId: identities[1].playerId, role: 'spymaster' });
  h.connect().send('join-room', { code, name: 'observer' }); // causes a real state broadcast
  const view = clients[1].last('game-state');
  assert.ok(view.cards.every((c) => c.type === null && c.typeVariant === null));
  assert.equal(view.you.role, 'operative');
});

test('players cannot change another player in the lobby', (t) => {
  const { clients, identities } = harness(t).lobby();
  clients[1].send('assign-team', { targetId: identities[2].playerId, team: 'red', role: 'operative' });
  const target = clients[1].last('lobby-state').players.find((p) => p.id === identities[2].playerId);
  assert.equal(target.team, 'blue');
  assert.equal(target.role, 'spymaster');
});

test('even the host cannot move a key holder to operative during a game', (t) => {
  const { host, identities } = harness(t).classic();
  host.send('assign-team', { targetId: identities[0].playerId, role: 'operative' });
  assert.equal(host.last('lobby-state').players[0].role, 'spymaster');
});

test('spectator cannot steal either Duet key', (t) => {
  const h = harness(t);
  const { host, clients, identities, code } = h.lobby();
  host.send('set-game-type', { gameType: 'duet' });
  host.send('assign-duet-slot', { targetId: identities[0].playerId, team: 'red' });
  host.send('assign-duet-slot', { targetId: identities[1].playerId, team: 'blue' });
  host.send('start-game');
  clients[2].send('assign-duet-slot', { targetId: identities[2].playerId, team: 'red' });
  h.connect().send('join-room', { code, name: 'observer' });
  assert.equal(clients[2].last('game-state').you.duetSide, null);
  assert.ok(clients[2].last('game-state').cards.every((c) => c.myType === null));
});

test('replaced session cannot mutate or leave using the old socket', (t) => {
  const h = harness(t);
  const { host, identities } = h.lobby();
  const replacement = h.connect(identities[0].sessionToken);
  host.send('set-timeout', { seconds: 60 });
  host.send('leave-room');
  replacement.send('set-mode', { mode: 'pictures' });
  assert.equal(replacement.last('lobby-state').turnTimeout, 0);
  assert.equal(replacement.last('lobby-state').players.length, 4);
  assert.equal(replacement.last('lobby-state').mode, 'pictures');
});

test('spymaster cannot guess or end a turn when its operative leaves', (t) => {
  const { host, clients } = harness(t).classic();
  const team = host.last('game-state').currentTeam;
  const spy = team === 'red' ? host : clients[2];
  const operative = team === 'red' ? clients[1] : clients[3];
  spy.send('give-clue', { word: 'ZXQ', count: 1 });
  operative.send('leave-room');
  spy.send('make-guess', { cardIndex: 0 });
  spy.send('end-turn');
  assert.equal(spy.last('game-state').phase, 'operative');
  assert.ok(spy.last('game-state').cards.every((c) => !c.revealed));
});

test('host cannot reroll a running board or change its settings', (t) => {
  const { host } = harness(t).classic();
  const before = host.last('game-state');
  host.send('start-game');
  host.send('play-again');
  host.send('set-mode', { mode: 'pictures' });
  host.send('set-category', { categoryId: 'pokemon', difficulty: 'hard' });
  host.send('set-timeout', { seconds: 60 });
  assert.deepEqual(host.last('game-state'), before);
  assert.equal(host.last('lobby-state').mode, 'words');
  assert.equal(host.last('lobby-state').turnTimeout, 0);
  assert.equal(host.last('lobby-state').categoryId, 'standard');
});

test('an operative cannot give clues and opponents cannot guess or end your turn', (t) => {
  const { host, clients } = harness(t).classic();
  const redTurn = host.last('game-state').currentTeam === 'red';
  const spy = redTurn ? host : clients[2];
  const operative = redTurn ? clients[1] : clients[3];
  const opponent = redTurn ? clients[3] : clients[1];
  operative.send('give-clue', { word: 'ZXQ', count: 1 });
  assert.equal(host.last('game-state').phase, 'spymaster');
  spy.send('give-clue', { word: 'ZXQ', count: 1 });
  opponent.send('make-guess', { cardIndex: 0 });
  opponent.send('end-turn');
  assert.equal(host.last('game-state').phase, 'operative');
  assert.ok(host.last('game-state').cards.every((c) => !c.revealed));
});

test('expired turn rejects an action before the timer interval runs', (t) => {
  const { host, clients } = harness(t).lobby();
  host.send('set-timeout', { seconds: 60 });
  host.send('start-game');
  const before = host.last('game-state');
  const spy = before.currentTeam === 'red' ? host : clients[2];
  t.mock.method(Date, 'now', () => before.turnDeadline + 1);
  spy.send('give-clue', { word: 'ZXQ', count: 1 });
  assert.notEqual(host.last('game-state').currentTeam, before.currentTeam);
  assert.equal(host.last('game-state').currentClue, null);
});

test('ordinary join and reconnect remain redacted; own role is restored', (t) => {
  const h = harness(t);
  const { clients, identities, code } = h.classic();
  const observer = h.connect();
  observer.send('join-room', { code, name: 'observer' });
  const replacement = h.connect(identities[1].sessionToken);
  for (const socket of [observer, replacement]) {
    assert.ok(socket.last('game-state').cards.every((c) => c.type === null));
  }
  assert.equal(replacement.last('game-state').you.id, identities[1].playerId);
});

test('Duet slots cannot be stolen in the lobby, but the host can reassign them', (t) => {
  const { host, clients, identities } = harness(t).lobby();
  host.send('set-game-type', { gameType: 'duet' });
  host.send('assign-duet-slot', { targetId: identities[0].playerId, team: 'red' });
  clients[1].send('assign-duet-slot', { targetId: identities[1].playerId, team: 'red' });
  assert.equal(host.last('lobby-state').playerA, identities[0].playerId);
  host.send('assign-duet-slot', { targetId: identities[1].playerId, team: 'red' });
  assert.equal(host.last('lobby-state').playerA, identities[1].playerId);
});

test('minority votes cannot reveal cards and are not exposed to the opposing team', (t) => {
  const h = harness(t);
  const { host, clients, code } = h.lobby();
  const extra = h.connect();
  const extraId = extra.send('join-room', { code, name: 'extra' }).playerId;
  // Add a second operative to both teams so either starting team needs consensus.
  host.send('assign-team', { targetId: extraId, team: 'red' });
  const extraBlue = h.connect();
  const blueId = extraBlue.send('join-room', { code, name: 'extraBlue' }).playerId;
  host.send('assign-team', { targetId: blueId, team: 'blue' });
  host.send('start-game');
  const redTurn = host.last('game-state').currentTeam === 'red';
  const spy = redTurn ? host : clients[2];
  const operative = redTurn ? clients[1] : clients[3];
  const ally = redTurn ? extra : extraBlue;
  const opponent = redTurn ? clients[3] : clients[1];
  spy.send('give-clue', { word: 'ZXQ', count: 1 });
  operative.send('cast-vote', { cardIndex: 0 });
  operative.send('make-guess', { cardIndex: 0 });
  assert.ok(!operative.last('game-state').cards[0].revealed);
  assert.deepEqual(opponent.last('game-state').votes, {});
  ally.send('cast-vote', { cardIndex: 0 });
  operative.send('make-guess', { cardIndex: 0 });
  assert.ok(operative.last('game-state').cards[0].revealed);
});

test('malformed payloads cannot mutate the board or crash the handlers', (t) => {
  const { host, clients } = harness(t).classic();
  const before = host.last('game-state');
  for (const event of ['assign-team', 'make-guess', 'give-clue', 'set-timeout']) {
    for (const payload of [null, {}, { cardIndex: -1 }, { cardIndex: 100 }, { cardIndex: '0' }]) {
      assert.doesNotThrow(() => clients[1].send(event, payload));
    }
  }
  assert.deepEqual(host.last('game-state'), before);
});

test('new rooms survive the idle sweep; expired-room sockets can create again', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 2_000_000_000_000 });
  const h = harness(t);
  const host = h.connect();
  host.send('create-room', { name: 'host' });
  startIdleSweep(h.io);
  t.mock.timers.tick(60_000);
  host.send('set-mode', { mode: 'pictures' });
  assert.equal(host.last('lobby-state').mode, 'pictures');
  t.mock.timers.tick(31 * 60_000);
  const reply = host.send('create-room', { name: 'host' });
  assert.equal(reply.error, undefined);
  assert.equal(reply.code.length, 6);
});
