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

test('an essential player leaving returns to the lobby and prevents further guesses', (t) => {
  const { host, clients } = harness(t).classic();
  const team = host.last('game-state').currentTeam;
  const spy = team === 'red' ? host : clients[2];
  const operative = team === 'red' ? clients[1] : clients[3];
  spy.send('give-clue', { word: 'ZXQ', count: 1 });
  operative.send('leave-room');
  spy.send('make-guess', { cardIndex: 0 });
  spy.send('end-turn');
  assert.equal(spy.last('lobby-state').inGame, false);
  assert.match(spy.last('error-msg'), /essential player left/i);
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

function timedHarness(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 2_000_000_000_000 });
  const h = harness(t);
  // The regular cleanup removes connected players first. Expire any disconnected
  // players and outstanding requests before restoring the real timer functions.
  t.after(() => t.mock.timers.tick(120_001));
  return h;
}

function duetLobby(h) {
  const room = h.lobby();
  room.host.send('set-game-type', { gameType: 'duet' });
  room.host.send('assign-duet-slot', { targetId: room.identities[0].playerId, team: 'red' });
  room.host.send('assign-duet-slot', { targetId: room.identities[1].playerId, team: 'blue' });
  return room;
}

test('approval applicants cannot receive room state or chat; only the host can admit them', (t) => {
  const h = timedHarness(t);
  const { host, clients, code, identities } = h.classic();
  host.send('set-access', { mode: 'approval' });
  const applicant = h.connect();
  assert.deepEqual(applicant.send('join-room', { code, name: 'applicant' }), { code, pending: true });
  const request = host.last('room-controls').requests[0];
  assert.deepEqual(Object.keys(request).sort(), ['id', 'name']);
  assert.equal(request.name, 'applicant');
  assert.equal(applicant.rooms.has(code), false);
  assert.equal(clients[1].last('room-controls'), undefined);
  assert.equal(applicant.last('room-controls'), undefined);
  host.send('send-chat', { text: 'private room discussion' });
  clients[1].send('review-join', { requestId: request.id, approve: true });
  applicant.send('review-join', { requestId: request.id, approve: true });
  clients[1].send('set-access', { mode: 'open' });
  clients[1].send('remove-player', { targetId: identities[2].playerId, ban: true });
  assert.equal(host.last('lobby-state').accessMode, 'approval');
  assert.equal(host.last('lobby-state').players.length, 4);
  for (const event of ['lobby-state', 'game-state', 'chat-message', 'join-approved'])
    assert.equal(applicant.last(event), undefined);
  host.send('review-join', { requestId: request.id, approve: true });
  assert.equal(applicant.last('join-approved').code, code);
  assert.ok(applicant.last('join-approved').sessionToken);
  assert.equal(applicant.last('game-state').you.role, 'spectator');
  assert.ok(applicant.last('game-state').cards.every((card) => card.type === null && card.typeVariant === null));
  assert.equal(host.last('room-controls').requests.length, 0);
});

test('host approval is scoped to its own room and rejects names taken while waiting', (t) => {
  const h = timedHarness(t);
  const { host, code } = h.lobby();
  host.send('set-access', { mode: 'approval' });
  const applicants = [h.connect(), h.connect()];
  applicants.forEach((socket) => socket.send('join-room', { code, name: 'same-name' }));
  const requests = host.last('room-controls').requests;
  const otherHost = h.connect();
  otherHost.send('create-room', { name: 'other-host' });
  otherHost.send('review-join', { requestId: requests[0].id, approve: true });
  assert.equal(applicants[0].last('join-approved'), undefined);
  host.send('review-join', { requestId: requests[0].id, approve: true });
  host.send('review-join', { requestId: requests[1].id, approve: true });
  assert.ok(applicants[0].last('join-approved').sessionToken);
  assert.equal(applicants[1].last('join-approved').error, 'Name taken');
  assert.equal(applicants[1].rooms.has(code), false);
  assert.equal(host.last('lobby-state').players.length, 5);
});

test('locked rooms reject new arrivals but restore authenticated players and their redacted view', (t) => {
  const h = timedHarness(t);
  const { host, clients, identities, code } = h.classic();
  host.send('set-access', { mode: 'locked' });
  assert.equal(h.connect().send('join-room', { code, name: 'outsider' }).error, 'Room is locked');
  clients[1].disconnect();
  assert.deepEqual(host.last('game-state').pause.missingPlayerIds, [identities[1].playerId]);
  const restored = h.connect(identities[1].sessionToken);
  assert.equal(restored.last('rejoined').playerId, identities[1].playerId);
  assert.equal(restored.last('lobby-state').accessMode, 'locked');
  assert.equal(restored.last('game-state').you.role, 'operative');
  assert.equal(restored.last('game-state').pause, null);
  assert.ok(restored.last('game-state').cards.every((card) => card.type === null));
});

test('host bans revoke sessions, hide blocked tokens, and only host unblocking permits rejoining', (t) => {
  const h = timedHarness(t);
  const { host, clients, identities, code } = h.lobby();
  const targetId = identities[2].playerId;
  const token = identities[2].sessionToken;
  host.send('remove-player', { targetId, ban: true });
  assert.equal(clients[2].last('removed-from-room').blocked, true);
  assert.equal(clients[2].rooms.has(code), false);
  assert.deepEqual(host.last('room-controls').blockedPlayers, [{ id: targetId, name: 'p2' }]);
  assert.equal(JSON.stringify(host.last('room-controls')).includes(token), false);
  assert.match(clients[2].send('join-room', { code, name: 'p2' }).error, /blocked/);
  const restored = h.connect(token);
  assert.equal(restored.last('rejoined'), undefined);
  assert.match(restored.send('join-room', { code, name: 'p2' }).error, /blocked/);
  clients[1].send('unblock-player', { targetId });
  assert.match(restored.send('join-room', { code, name: 'p2' }).error, /blocked/);
  host.send('unblock-player', { targetId });
  assert.deepEqual(host.last('room-controls').blockedPlayers, []);
  const rejoined = restored.send('join-room', { code, name: 'p2' });
  assert.ok(rejoined.sessionToken);
  assert.notEqual(rejoined.playerId, targetId);
  assert.equal(restored.last('lobby-state').players.find((p) => p.id === rejoined.playerId).team, null);
});

test('a kick revokes restoration but permits a fresh join without adding a ban', (t) => {
  const h = timedHarness(t);
  const { host, clients, identities, code } = h.lobby();
  host.send('remove-player', { targetId: identities[1].playerId, ban: false });
  assert.equal(clients[1].last('removed-from-room').blocked, false);
  assert.deepEqual(host.last('room-controls').blockedPlayers, []);
  const restored = h.connect(identities[1].sessionToken);
  assert.equal(restored.last('rejoined'), undefined);
  assert.ok(restored.send('join-room', { code, name: 'p1' }).sessionToken);
});

test('cancelled and disconnected join requests cannot be approved later', (t) => {
  const h = timedHarness(t);
  const { host, code } = h.lobby();
  host.send('set-access', { mode: 'approval' });
  for (const method of ['leave-room', 'disconnect']) {
    const applicant = h.connect();
    applicant.send('join-room', { code, name: method });
    const requestId = host.last('room-controls').requests[0].id;
    if (method === 'disconnect') applicant.disconnect();
    else applicant.send('leave-room');
    assert.deepEqual(host.last('room-controls').requests, []);
    host.send('review-join', { requestId, approve: true });
    assert.equal(applicant.last('join-approved'), undefined);
    assert.equal(applicant.rooms.has(code), false);
    if (method === 'leave-room') {
      assert.match(applicant.last('join-rejected'), /cancelled/);
      assert.ok(applicant.send('create-room', { name: 'new host' }).sessionToken);
    }
  }
});

test('locking and expiry clear pending admission state and do not admit late approvals', (t) => {
  const h = timedHarness(t);
  const { host, code } = h.lobby();
  host.send('set-access', { mode: 'approval' });
  const applicant = h.connect();
  applicant.send('join-room', { code, name: 'waiting' });
  const firstRequest = host.last('room-controls').requests[0].id;
  host.send('set-access', { mode: 'locked' });
  assert.match(applicant.last('join-rejected'), /no longer accepting/);
  assert.deepEqual(host.last('room-controls').requests, []);
  host.send('review-join', { requestId: firstRequest, approve: true });
  assert.equal(applicant.last('join-approved'), undefined);
  host.send('set-access', { mode: 'approval' });
  assert.equal(applicant.send('join-room', { code, name: 'waiting' }).pending, true);
  const expiredRequest = host.last('room-controls').requests[0].id;
  t.mock.timers.tick(120_000);
  assert.match(applicant.last('join-rejected'), /expired/);
  assert.deepEqual(host.last('room-controls').requests, []);
  host.send('review-join', { requestId: expiredRequest, approve: true });
  assert.equal(applicant.last('join-approved'), undefined);
  assert.equal(applicant.send('join-room', { code, name: 'waiting' }).pending, true);
});

test('essential disconnect pauses actions and preserves exactly the remaining turn time on reconnect', (t) => {
  const h = timedHarness(t);
  const { host, clients, identities } = h.lobby();
  host.send('set-timeout', { seconds: 60 });
  host.send('start-game');
  const initial = host.last('game-state');
  const redTurn = initial.currentTeam === 'red';
  const spy = redTurn ? host : clients[2];
  const operativeIndex = redTurn ? 1 : 3;
  t.mock.timers.tick(10_000);
  clients[operativeIndex].disconnect();
  const paused = spy.last('game-state');
  assert.equal(paused.turnDeadline, null);
  assert.equal(paused.pause.until, Date.now() + 60_000);
  assert.deepEqual(paused.pause.missingPlayerIds, [identities[operativeIndex].playerId]);
  assert.equal(paused.players.find((p) => p.id === identities[operativeIndex].playerId).connected, false);
  for (const [event, payload] of [
    ['give-clue', { word: 'ZXQ', count: 1 }],
    ['make-guess', { cardIndex: 0 }],
    ['cast-vote', { cardIndex: 0 }],
    ['end-turn', undefined],
  ]) {
    spy.send(event, payload);
    assert.match(spy.last('error-msg'), /paused/);
  }
  t.mock.timers.tick(20_000);
  const restored = h.connect(identities[operativeIndex].sessionToken);
  const resumed = restored.last('game-state');
  assert.equal(resumed.pause, null);
  assert.equal(resumed.turnDeadline, Date.now() + 50_000);
  assert.equal(resumed.currentTeam, initial.currentTeam);
  assert.equal(resumed.phase, 'spymaster');
  assert.ok(resumed.cards.every((card) => !card.revealed));
  t.mock.timers.tick(49_999);
  assert.equal(spy.last('game-state').currentTeam, initial.currentTeam);
  t.mock.timers.tick(1);
  assert.notEqual(spy.last('game-state').currentTeam, initial.currentTeam);
});

test('multiple missing players share one pause deadline and repeated disconnects cannot refill the budget', (t) => {
  const h = timedHarness(t);
  const { host, clients, identities } = h.classic();
  clients[1].disconnect();
  const pauseUntil = host.last('game-state').pause.until;
  t.mock.timers.tick(10_000);
  clients[3].disconnect();
  assert.equal(host.last('game-state').pause.until, pauseUntil);
  t.mock.timers.tick(10_000);
  const first = h.connect(identities[1].sessionToken);
  assert.deepEqual(host.last('game-state').pause.missingPlayerIds, [identities[3].playerId]);
  assert.equal(host.last('game-state').pause.until, pauseUntil);
  t.mock.timers.tick(10_000);
  h.connect(identities[3].sessionToken);
  assert.equal(host.last('game-state').pause, null);
  assert.equal(host.last('game-state').turnDeadline, null); // Untimed game stays untimed.
  t.mock.timers.tick(5_000);
  first.disconnect();
  assert.equal(host.last('game-state').pause.until, Date.now() + 30_000);
  t.mock.timers.tick(30_000);
  assert.equal(host.last('lobby-state').inGame, false);
  assert.match(host.last('error-msg'), /Reconnect time expired/);
  const restored = h.connect(identities[1].sessionToken);
  assert.equal(restored.last('rejoined').inGame, false);
  assert.equal(restored.last('game-state'), undefined);
});

test('spectators and nonessential operative disconnects do not pause; departed votes stop counting', (t) => {
  const h = timedHarness(t);
  const { host, clients, identities, code } = h.lobby();
  const extraRed = h.connect();
  const extraBlue = h.connect();
  const redId = extraRed.send('join-room', { code, name: 'extra-red' }).playerId;
  const blueId = extraBlue.send('join-room', { code, name: 'extra-blue' }).playerId;
  host.send('assign-team', { targetId: redId, team: 'red' });
  host.send('assign-team', { targetId: blueId, team: 'blue' });
  host.send('start-game');
  const spectator = h.connect();
  spectator.send('join-room', { code, name: 'observer' });
  spectator.disconnect();
  assert.equal(host.last('game-state').pause, null);
  const redTurn = host.last('game-state').currentTeam === 'red';
  const spy = redTurn ? host : clients[2];
  const originalIndex = redTurn ? 1 : 3;
  const remaining = redTurn ? extraRed : extraBlue;
  spy.send('give-clue', { word: 'ZXQ', count: 1 });
  clients[originalIndex].send('cast-vote', { cardIndex: 0 });
  assert.deepEqual(remaining.last('game-state').votes['0'], [identities[originalIndex].playerId]);
  clients[originalIndex].disconnect();
  assert.equal(remaining.last('game-state').pause, null);
  assert.deepEqual(remaining.last('game-state').votes, {});
  assert.equal(remaining.last('game-state').you.isSolo, true);
});

test('Duet seat disconnect pauses and restores its own key without exposing the opposite key', (t) => {
  const h = timedHarness(t);
  const { host, clients, identities } = duetLobby(h);
  host.send('set-timeout', { seconds: 60 });
  host.send('start-game');
  const before = clients[1].last('game-state');
  t.mock.timers.tick(8_000);
  clients[1].disconnect();
  assert.deepEqual(host.last('game-state').pause.missingPlayerIds, [identities[1].playerId]);
  assert.equal(host.last('game-state').turnDeadline, null);
  host.send('give-clue', { word: 'ZXQ', count: 1 });
  assert.match(host.last('error-msg'), /paused/);
  t.mock.timers.tick(12_000);
  const restored = h.connect(identities[1].sessionToken);
  assert.equal(restored.last('game-state').pause, null);
  assert.equal(restored.last('game-state').turnDeadline, Date.now() + 52_000);
  assert.equal(restored.last('game-state').you.duetSide, 'B');
  assert.deepEqual(
    restored.last('game-state').cards.map((card) => card.myType),
    before.cards.map((card) => card.myType),
  );
  assert.ok(restored.last('game-state').cards.every((card) => card.typeA === undefined && card.typeB === undefined));
  restored.send('leave-room');
  assert.equal(host.last('lobby-state').inGame, false);
  assert.equal(host.last('lobby-state').playerB, null);
});

test('Duet grace expiry returns to the lobby instead of consuming turns while absent', (t) => {
  const h = timedHarness(t);
  const { host, clients } = duetLobby(h);
  host.send('set-timeout', { seconds: 60 });
  host.send('start-game');
  const turns = host.last('game-state').turnsRemaining;
  clients[1].disconnect();
  t.mock.timers.tick(59_999);
  assert.equal(host.last('game-state').turnsRemaining, turns);
  assert.notEqual(host.last('game-state').pause, null);
  t.mock.timers.tick(1);
  assert.equal(host.last('lobby-state').inGame, false);
});

test('pending requests are bounded and approval rechecks the live room capacity', (t) => {
  const h = timedHarness(t);
  const { host, code } = h.lobby();
  host.send('set-access', { mode: 'approval' });
  const applicants = Array.from({ length: 11 }, () => h.connect());
  const replies = applicants.map((socket, i) => socket.send('join-room', { code, name: `waiting-${i}` }));
  assert.ok(replies.slice(0, 10).every((reply) => reply.pending === true && reply.sessionToken === undefined));
  assert.match(replies[10].error, /Too many pending/);
  const requests = host.last('room-controls').requests;
  assert.equal(requests.length, 10);
  requests.slice(0, 6).forEach(({ id }) => host.send('review-join', { requestId: id, approve: true }));
  assert.equal(host.last('lobby-state').players.length, 10);
  host.send('review-join', { requestId: requests[6].id, approve: true });
  assert.deepEqual(applicants[6].last('join-approved'), { error: 'Room full' });
  assert.equal(applicants[6].rooms.has(code), false);
  assert.equal(applicants[6].last('lobby-state'), undefined);
});

test('pending requests transfer to the next host after the original host grace expires', (t) => {
  const h = timedHarness(t);
  const { host, clients, code } = h.lobby();
  host.send('set-access', { mode: 'approval' });
  const applicant = h.connect();
  applicant.send('join-room', { code, name: 'waiting' });
  const request = host.last('room-controls').requests[0];
  host.disconnect();
  assert.equal(clients[1].last('room-controls'), undefined);
  t.mock.timers.tick(60_000);
  assert.deepEqual(clients[1].last('room-controls').requests, [request]);
  host.send('review-join', { requestId: request.id, approve: true });
  assert.equal(applicant.last('join-approved'), undefined);
  clients[1].send('review-join', { requestId: request.id, approve: true });
  assert.ok(applicant.last('join-approved').sessionToken);
});

test('destroying a room rejects its pending applicants and lets them create another room', (t) => {
  const h = timedHarness(t);
  const host = h.connect();
  const { code } = host.send('create-room', { name: 'host' });
  host.send('set-access', { mode: 'approval' });
  const applicant = h.connect();
  applicant.send('join-room', { code, name: 'waiting' });
  host.send('leave-room');
  assert.match(applicant.last('join-rejected'), /no longer accepting/);
  assert.equal(applicant.rooms.has(code), false);
  assert.ok(applicant.send('create-room', { name: 'new host' }).sessionToken);
});

test('block list capacity preserves the next player session and unblocking frees capacity', (t) => {
  const h = timedHarness(t);
  const host = h.connect();
  const { code } = host.send('create-room', { name: 'host' });
  let firstBlocked;
  for (let i = 0; i < 100; i++) {
    t.mock.timers.tick(1_000); // Each moderation action has a fresh rate-limit window.
    const player = h.connect();
    const identity = player.send('join-room', { code, name: `player-${i}` });
    assert.ok(identity.sessionToken);
    if (i === 0) firstBlocked = identity;
    host.send('remove-player', { targetId: identity.playerId, ban: true });
    assert.equal(player.last('removed-from-room').blocked, true);
    player.disconnect();
  }
  assert.equal(host.last('room-controls').blockedPlayers.length, 100);
  const candidate = h.connect();
  const identity = candidate.send('join-room', { code, name: 'candidate' });
  host.send('remove-player', { targetId: identity.playerId, ban: true });
  assert.equal(
    host.last('error-msg'),
    'Block list full. Unblock someone or lock the room before removing more players.',
  );
  assert.equal(candidate.last('removed-from-room'), undefined);
  assert.equal(candidate.rooms.has(code), true);
  assert.equal(host.last('lobby-state').players.length, 2);
  assert.equal(host.last('room-controls').blockedPlayers.length, 100);
  const restored = h.connect(identity.sessionToken);
  assert.equal(restored.last('rejoined').playerId, identity.playerId);
  assert.equal(restored.rooms.has(code), true);
  assert.match(
    h.connect(firstBlocked.sessionToken).send('join-room', { code, name: 'still-blocked' }).error,
    /blocked/,
  );
  host.send('unblock-player', { targetId: firstBlocked.playerId });
  assert.equal(host.last('room-controls').blockedPlayers.length, 99);
  host.send('remove-player', { targetId: identity.playerId, ban: true });
  assert.equal(restored.last('removed-from-room').blocked, true);
  assert.equal(restored.rooms.has(code), false);
  assert.equal(host.last('room-controls').blockedPlayers.length, 100);
  assert.ok(host.last('room-controls').blockedPlayers.some((player) => player.id === identity.playerId));
});
