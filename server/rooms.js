const { createGame, processGuess, submitClue, endTurn, getPlayerView, castVote, getVoteMajority, clearVotes } = require('./game');
const { validateWordList } = require('./wordlists');

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function nextAvatarId(room) {
  const used = new Set(room.players.map((p) => p.avatarId));
  for (let i = 1; i <= 8; i++) {
    if (!used.has(i)) return i;
  }
  return (Math.floor(Math.random() * 8) + 1);
}

function createRoom() {
  const code = generateCode();
  const room = {
    code,
    host: null,
    players: [],
    mode: 'words',
    customWords: null,
    game: null,
    chatLog: [],
  };
  rooms.set(code, room);
  return room;
}

function isSoloOnTeam(room, player) {
  return player.team && room.players.filter((p) => p.team === player.team).length === 1;
}

function buildRoomMeta(room) {
  const avatarMap = {};
  for (const pl of room.players) avatarMap[pl.id] = pl.avatarId;
  const roster = room.players.map((pl) => ({ id: pl.id, name: pl.name, team: pl.team, role: pl.role, avatarId: pl.avatarId }));
  return { avatarMap, roster };
}

function broadcastState(io, room) {
  if (!room.game) return;
  const { avatarMap, roster } = buildRoomMeta(room);
  for (const p of room.players) {
    const solo = isSoloOnTeam(room, p);
    const view = getPlayerView(room.game, p.role);
    io.to(p.socketId).emit('game-state', {
      ...view,
      roomCode: room.code,
      chatLog: room.chatLog,
      playerAvatars: avatarMap,
      players: roster,
      you: { id: p.id, name: p.name, team: p.team, role: p.role, isHost: p.id === room.host, isSolo: solo, avatarId: p.avatarId },
    });
  }
}

function broadcastLobby(io, room) {
  const data = {
    code: room.code,
    mode: room.mode,
    players: room.players.map((p) => ({ id: p.id, name: p.name, team: p.team, role: p.role, isHost: p.id === room.host, avatarId: p.avatarId })),
    hostId: room.host,
    inGame: !!room.game,
  };
  io.to(room.code).emit('lobby-state', data);
}

function setupRoomHandlers(io, socket) {
  let currentRoom = null;
  let playerId = null;

  socket.on('create-room', ({ name }, cb) => {
    if (!name || name.trim().length === 0) return cb({ error: 'Name required' });
    const room = createRoom();
    const player = { id: socket.id, socketId: socket.id, name: name.trim().slice(0, 20), team: null, role: 'operative', avatarId: nextAvatarId(room) };
    room.players.push(player);
    room.host = player.id;
    currentRoom = room;
    playerId = player.id;
    socket.join(room.code);
    cb({ code: room.code });
    broadcastLobby(io, room);
  });

  socket.on('join-room', ({ code, name }, cb) => {
    if (!code || !name) return cb({ error: 'Code and name required' });
    const roomCode = code.trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return cb({ error: 'Room not found' });
    if (room.players.length >= 10) return cb({ error: 'Room full' });
    if (room.players.find((p) => p.name === name.trim())) return cb({ error: 'Name taken' });

    const player = { id: socket.id, socketId: socket.id, name: name.trim().slice(0, 20), team: null, role: 'operative', avatarId: nextAvatarId(room) };
    room.players.push(player);
    currentRoom = room;
    playerId = player.id;
    socket.join(room.code);
    cb({ code: room.code, inGame: !!room.game });
    broadcastLobby(io, room);

    if (room.game) {
      const { avatarMap, roster } = buildRoomMeta(room);
      const solo = isSoloOnTeam(room, player);
      const view = getPlayerView(room.game, player.role);
      socket.emit('game-state', {
        ...view,
        roomCode: room.code,
        chatLog: room.chatLog,
        playerAvatars: avatarMap,
        players: roster,
        you: { id: player.id, name: player.name, team: player.team, role: player.role, isHost: player.id === room.host, isSolo: solo, avatarId: player.avatarId },
      });
    }
  });

  socket.on('assign-team', ({ targetId, team, role }) => {
    if (!currentRoom) return;
    const p = currentRoom.players.find((pl) => pl.id === targetId);
    if (!p) return;
    if (team !== undefined) p.team = team;
    if (role !== undefined) p.role = role;
    broadcastLobby(io, currentRoom);
  });

  socket.on('set-mode', ({ mode }) => {
    if (!currentRoom || playerId !== currentRoom.host) return;
    if (mode !== 'pictures' && mode !== 'words') return;
    currentRoom.mode = mode;
    broadcastLobby(io, currentRoom);
  });

  socket.on('set-wordlist', ({ words }) => {
    if (!currentRoom || playerId !== currentRoom.host) return;
    if (!words || words.length === 0) {
      currentRoom.customWords = null;
      socket.emit('wordlist-status', { status: 'default' });
      return;
    }
    const validated = validateWordList(words);
    if (!validated) {
      socket.emit('wordlist-status', { status: 'error', message: 'Need at least 25 unique words' });
      return;
    }
    currentRoom.customWords = validated;
    socket.emit('wordlist-status', { status: 'custom', count: validated.length });
  });

  socket.on('start-game', () => {
    if (!currentRoom || playerId !== currentRoom.host) return;
    const reds = currentRoom.players.filter((p) => p.team === 'red');
    const blues = currentRoom.players.filter((p) => p.team === 'blue');
    if (reds.length < 1 || blues.length < 1) {
      socket.emit('error-msg', 'Each team needs at least 1 player');
      return;
    }
    const redSpy = reds.find((p) => p.role === 'spymaster');
    const blueSpy = blues.find((p) => p.role === 'spymaster');
    if (!redSpy || !blueSpy) {
      socket.emit('error-msg', 'Each team needs a spymaster');
      return;
    }
    currentRoom.game = createGame(currentRoom.mode, currentRoom.customWords);
    broadcastState(io, currentRoom);
  });

  socket.on('give-clue', ({ word, count }) => {
    if (!currentRoom || !currentRoom.game) return;
    const me = currentRoom.players.find((p) => p.id === playerId);
    if (!me || me.role !== 'spymaster') return;
    const result = submitClue(currentRoom.game, me.team, word, count);
    if (result.error) return socket.emit('error-msg', result.error);
    broadcastState(io, currentRoom);
  });

  socket.on('cast-vote', ({ cardIndex }) => {
    if (!currentRoom || !currentRoom.game) return;
    const me = currentRoom.players.find((p) => p.id === playerId);
    if (!me) return;
    if (me.role !== 'operative') return;
    if (currentRoom.game.currentTeam !== me.team) return;
    if (currentRoom.game.phase !== 'operative') return;
    const result = castVote(currentRoom.game, cardIndex, me.id);
    if (result.error) return socket.emit('error-msg', result.error);
    broadcastState(io, currentRoom);
  });

  socket.on('make-guess', ({ cardIndex }) => {
    if (!currentRoom || !currentRoom.game) return;
    const me = currentRoom.players.find((p) => p.id === playerId);
    if (!me) return;
    const solo = isSoloOnTeam(currentRoom, me);
    if (me.role !== 'operative' && !solo) return;
    if (currentRoom.game.currentTeam !== me.team) return;
    if (currentRoom.game.phase !== 'operative') return;
    if (!solo) {
      const majority = getVoteMajority(currentRoom.game);
      if (majority === null || majority !== cardIndex) {
        return socket.emit('error-msg', 'No majority vote on that card');
      }
    }
    const result = processGuess(currentRoom.game, cardIndex, me.team);
    if (result.error) return socket.emit('error-msg', result.error);
    broadcastState(io, currentRoom);
  });

  socket.on('end-turn', () => {
    if (!currentRoom || !currentRoom.game) return;
    const me = currentRoom.players.find((p) => p.id === playerId);
    if (!me) return;
    const result = endTurn(currentRoom.game, me.team);
    if (result.error) return socket.emit('error-msg', result.error);
    broadcastState(io, currentRoom);
  });

  socket.on('send-chat', ({ text }) => {
    if (!currentRoom || !text || text.trim().length === 0) return;
    const me = currentRoom.players.find((p) => p.id === playerId);
    if (!me) return;
    const msg = { id: `${Date.now()}-${playerId}`, name: me.name, team: me.team, text: text.trim().slice(0, 200), ts: Date.now() };
    currentRoom.chatLog.push(msg);
    if (currentRoom.chatLog.length > 200) currentRoom.chatLog.shift();
    io.to(currentRoom.code).emit('chat-message', msg);
  });

  socket.on('play-again', () => {
    if (!currentRoom || playerId !== currentRoom.host) return;
    currentRoom.game = null;
    broadcastLobby(io, currentRoom);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    currentRoom.players = currentRoom.players.filter((p) => p.id !== playerId);
    if (currentRoom.players.length === 0) {
      rooms.delete(currentRoom.code);
      return;
    }
    if (currentRoom.host === playerId) {
      currentRoom.host = currentRoom.players[0].id;
    }
    broadcastLobby(io, currentRoom);
    if (currentRoom.game) broadcastState(io, currentRoom);
  });
}

module.exports = { setupRoomHandlers };
