import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { z } from 'zod';
import {
  createGame, processGuess, submitClue, endTurn,
  getPlayerView, castVote, getVoteMajority, clearVotes,
  switchTurn, setDeadline,
} from './game';
import {
  createDuetGame, submitDuetClue, processDuetGuess,
  endDuetTurn, getDuetPlayerView, setDuetDeadline, skipDuetTurn,
} from './duet';
import { validateWordList, getWordsForGame, CATEGORY_LIST, DEFAULT_CATEGORY, DEFAULT_DIFFICULTY } from './wordlists';
import type { Room, Player, ChatMessage, Team, DuetState, GameState, DuetSide } from './types';
import {
  CreateRoomSchema, JoinRoomSchema, AssignTeamSchema,
  SetModeSchema, SetCategorySchema, SetWordlistSchema, GiveClueSchema,
  CardIndexSchema, SendChatSchema, SetTimeoutSchema, SetGameTypeSchema,
} from './types';

const rooms = new Map<string, Room>();

const roomTimers = new Map<string, ReturnType<typeof setInterval>>();
const roomLastActivity = new Map<string, number>();

interface Session { playerId: string; roomCode: string }
const sessions = new Map<string, Session>();
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DISCONNECT_GRACE_MS = 60_000;

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_LEN = 4;
const MAX_PLAYERS = 10;
const MAX_CHAT_LOG = 200;
const MAX_AVATAR_ID = 8;
const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;

// Per-socket rate limiting: max events per window
const RATE_LIMIT_WINDOW_MS = 1_000;
const RATE_LIMIT_MAX_EVENTS = 20;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimits = new WeakMap<Socket, RateLimitBucket>();

function checkRateLimit(socket: Socket): boolean {
  const now = Date.now();
  let bucket = rateLimits.get(socket);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimits.set(socket, bucket);
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT_MAX_EVENTS;
}

function touchRoom(room: Room): void {
  roomLastActivity.set(room.code, Date.now());
}

function destroyRoom(room: Room, io: Server): void {
  clearRoomTimer(room);
  roomLastActivity.delete(room.code);
  for (const p of room.players) {
    cancelDisconnectTimer(p.id);
    deleteSessionsForPlayer(p.id);
    const s = io.sockets.sockets.get(p.socketId);
    if (s) {
      s.emit('session-expired');
      s.leave(room.code);
    }
  }
  rooms.delete(room.code);
}

function generateCode(): string {
  let code: string;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LEN; i++) {
      code += ROOM_CODE_CHARS[randomInt(0, ROOM_CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function nextAvatarId(room: Room): number {
  const used = new Set(room.players.map((p) => p.avatarId));
  for (let i = 1; i <= MAX_AVATAR_ID; i++) {
    if (!used.has(i)) return i;
  }
  return randomInt(1, MAX_AVATAR_ID + 1);
}

function createRoom(): Room {
  const code = generateCode();
  const room: Room = {
    code,
    host: null,
    players: [],
    gameType: 'classic',
    mode: 'words',
    categoryId: DEFAULT_CATEGORY,
    difficulty: DEFAULT_DIFFICULTY,
    customWords: null,
    turnTimeout: 0,
    game: null,
    playerA: null,
    playerB: null,
    chatLog: [],
  };
  rooms.set(code, room);
  return room;
}

function isClassicGame(game: GameState | DuetState): game is GameState {
  return game.mode !== 'duet';
}

function isDuetGame(game: GameState | DuetState): game is DuetState {
  return game.mode === 'duet';
}

function getDuetSide(room: Room, pid: string): DuetSide | null {
  if (pid === room.playerA) return 'A';
  if (pid === room.playerB) return 'B';
  return null;
}

function isSoloOnTeam(room: Room, player: Player): boolean {
  return player.team !== null &&
    room.players.filter((p) => p.team === player.team).length === 1;
}

function buildRoomMeta(room: Room) {
  const avatarMap: Record<string, number> = {};
  for (const pl of room.players) avatarMap[pl.id] = pl.avatarId;
  const roster = room.players.map((pl) => ({
    id: pl.id, name: pl.name, team: pl.team, role: pl.role, avatarId: pl.avatarId,
  }));
  return { avatarMap, roster };
}

function broadcastState(io: Server, room: Room): void {
  if (!room.game) return;
  const { avatarMap, roster } = buildRoomMeta(room);

  if (isDuetGame(room.game)) {
    const duet = room.game;
    for (const p of room.players) {
      const side = getDuetSide(room, p.id);
      const view = getDuetPlayerView(duet, side);
      io.to(p.socketId).emit('game-state', {
        ...view,
        roomCode: room.code,
        chatLog: room.chatLog,
        playerAvatars: avatarMap,
        players: roster,
        you: {
          id: p.id, name: p.name, team: p.team, role: p.role,
          isHost: p.id === room.host, isSolo: false, avatarId: p.avatarId,
          duetSide: side,
        },
      });
    }
    return;
  }

  const classic = room.game;
  for (const p of room.players) {
    const solo = isSoloOnTeam(room, p);
    const view = getPlayerView(classic, p.role);
    io.to(p.socketId).emit('game-state', {
      ...view,
      roomCode: room.code,
      chatLog: room.chatLog,
      playerAvatars: avatarMap,
      players: roster,
      you: {
        id: p.id, name: p.name, team: p.team, role: p.role,
        isHost: p.id === room.host, isSolo: solo, avatarId: p.avatarId,
      },
    });
  }
}

function broadcastLobby(io: Server, room: Room): void {
  const data = {
    code: room.code,
    gameType: room.gameType,
    mode: room.mode,
    categoryId: room.categoryId,
    difficulty: room.difficulty,
    turnTimeout: room.turnTimeout,
    categories: CATEGORY_LIST,
    playerA: room.playerA,
    playerB: room.playerB,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, team: p.team, role: p.role,
      isHost: p.id === room.host, avatarId: p.avatarId,
    })),
    hostId: room.host,
    inGame: !!room.game,
  };
  io.to(room.code).emit('lobby-state', data);
}

function clearRoomTimer(room: Room): void {
  const existing = roomTimers.get(room.code);
  if (existing) {
    clearInterval(existing);
    roomTimers.delete(room.code);
  }
}

function startRoomTimer(io: Server, room: Room): void {
  clearRoomTimer(room);
  if (room.turnTimeout === 0) return;
  const interval = setInterval(() => {
    const game = room.game;
    if (!game || game.winner || game.turnDeadline === null) return;
    if (Date.now() < game.turnDeadline) return;
    if (isDuetGame(game)) {
      skipDuetTurn(game);
      if (!game.winner) setDuetDeadline(game, room.turnTimeout * 1000);
    } else {
      switchTurn(game);
      setDeadline(game, room.turnTimeout * 1000);
    }
    broadcastState(io, room);
  }, 1_000);
  roomTimers.set(room.code, interval);
}

function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) result[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return result;
}

function deleteSessionsForPlayer(pid: string): void {
  for (const [token, s] of sessions) {
    if (s.playerId === pid) { sessions.delete(token); break; }
  }
}

function cancelDisconnectTimer(pid: string): void {
  const timer = disconnectTimers.get(pid);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(pid);
  }
}

export function setupRoomHandlers(io: Server, socket: Socket): void {
  let currentRoom: Room | null = null;
  let playerId: string | null = null;

  function guarded(handler: () => void): void {
    if (!checkRateLimit(socket)) {
      socket.emit('error-msg', 'Rate limit exceeded');
      return;
    }
    if (currentRoom) touchRoom(currentRoom);
    handler();
  }

  // --- Session restoration from cookie ---
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const incomingToken = cookies['keknames_session'];
  if (incomingToken) {
    const session = sessions.get(incomingToken);
    if (session) {
      const room = rooms.get(session.roomCode);
      const player = room?.players.find((p) => p.id === session.playerId);
      if (room && player) {
        cancelDisconnectTimer(player.id);
        player.socketId = socket.id;
        currentRoom = room;
        playerId = player.id;
        socket.join(room.code);
        touchRoom(room);
        socket.emit('rejoined', { code: room.code, playerId: player.id, inGame: !!room.game });
        broadcastLobby(io, room);
        if (room.game) broadcastState(io, room);
      } else {
        sessions.delete(incomingToken);
        socket.emit('session-expired');
      }
    }
  }

  socket.on('create-room', (raw: unknown, cb: unknown) => {
    if (typeof cb !== 'function') return;
    guarded(() => {
      if (currentRoom) return (cb as Function)({ error: 'Already in a room' });
      const data = safeParse(CreateRoomSchema, raw);
      if (!data) return (cb as Function)({ error: 'Invalid input' });
      const room = createRoom();
      const pid = randomUUID();
      const token = randomUUID();
      const player: Player = {
        id: pid, socketId: socket.id,
        name: data.name.slice(0, 20), team: null, role: 'operative',
        avatarId: nextAvatarId(room),
      };
      room.players.push(player);
      room.host = player.id;
      currentRoom = room;
      playerId = player.id;
      sessions.set(token, { playerId: pid, roomCode: room.code });
      socket.join(room.code);
      (cb as Function)({ code: room.code, sessionToken: token, playerId: pid });
      broadcastLobby(io, room);
    });
  });

  socket.on('join-room', (raw: unknown, cb: unknown) => {
    if (typeof cb !== 'function') return;
    guarded(() => {
      if (currentRoom) return (cb as Function)({ error: 'Already in a room' });
      const data = safeParse(JoinRoomSchema, raw);
      if (!data) return (cb as Function)({ error: 'Invalid input' });
      const roomCode = data.code.toUpperCase();
      const room = rooms.get(roomCode);
      if (!room) return (cb as Function)({ error: 'Room not found' });
      if (room.players.length >= MAX_PLAYERS) return (cb as Function)({ error: 'Room full' });
      if (room.players.find((p) => p.name === data.name)) {
        return (cb as Function)({ error: 'Name taken' });
      }

      const pid = randomUUID();
      const token = randomUUID();
      const joiningMidGame = !!room.game;
      const player: Player = {
        id: pid, socketId: socket.id,
        name: data.name.slice(0, 20), team: null,
        role: joiningMidGame ? 'spectator' : 'operative',
        avatarId: nextAvatarId(room),
      };
      room.players.push(player);
      currentRoom = room;
      playerId = player.id;
      sessions.set(token, { playerId: pid, roomCode: room.code });
      socket.join(room.code);
      (cb as Function)({ code: room.code, inGame: joiningMidGame, sessionToken: token, playerId: pid });
      broadcastLobby(io, room);

      if (room.game) {
        broadcastState(io, room);
      }
    });
  });

  socket.on('assign-team', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom) return;
      const data = safeParse(AssignTeamSchema, raw);
      if (!data) return;
      const p = currentRoom.players.find((pl) => pl.id === data.targetId);
      if (!p) return;
      if (data.team !== undefined) {
        p.team = data.team;
        if (data.team === null) {
          p.role = 'spectator';
        } else if (p.role === 'spectator') {
          p.role = 'operative';
        }
      }
      if (data.role !== undefined && p.team !== null) p.role = data.role;
      broadcastLobby(io, currentRoom);
    });
  });

  socket.on('set-mode', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      const data = safeParse(SetModeSchema, raw);
      if (!data) return;
      currentRoom.mode = data.mode;
      broadcastLobby(io, currentRoom);
    });
  });

  socket.on('set-game-type', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      if (currentRoom.game) return;
      const data = safeParse(SetGameTypeSchema, raw);
      if (!data) return;
      currentRoom.gameType = data.gameType;
      if (data.gameType === 'duet') {
        currentRoom.mode = 'words';
        for (const p of currentRoom.players) {
          p.team = null;
          p.role = 'operative';
        }
        currentRoom.playerA = null;
        currentRoom.playerB = null;
      }
      broadcastLobby(io, currentRoom);
    });
  });

  socket.on('assign-duet-slot', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom || currentRoom.gameType !== 'duet') return;
      const data = safeParse(AssignTeamSchema, raw);
      if (!data) return;
      const targetId = data.targetId;
      const p = currentRoom.players.find((pl) => pl.id === targetId);
      if (!p) return;
      const slot = data.team;
      if (slot === 'red') {
        if (currentRoom.playerA === targetId) { currentRoom.playerA = null; }
        else {
          if (currentRoom.playerB === targetId) currentRoom.playerB = null;
          currentRoom.playerA = targetId;
        }
      } else if (slot === 'blue') {
        if (currentRoom.playerB === targetId) { currentRoom.playerB = null; }
        else {
          if (currentRoom.playerA === targetId) currentRoom.playerA = null;
          currentRoom.playerB = targetId;
        }
      } else {
        if (currentRoom.playerA === targetId) currentRoom.playerA = null;
        if (currentRoom.playerB === targetId) currentRoom.playerB = null;
      }
      broadcastLobby(io, currentRoom);
    });
  });

  socket.on('set-category', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      const data = safeParse(SetCategorySchema, raw);
      if (!data) return;
      currentRoom.categoryId = data.categoryId;
      currentRoom.difficulty = data.difficulty;
      if (data.categoryId !== 'custom') currentRoom.customWords = null;
      broadcastLobby(io, currentRoom);
    });
  });

  socket.on('set-timeout', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      const data = safeParse(SetTimeoutSchema, raw);
      if (!data) return;
      currentRoom.turnTimeout = data.seconds;
      broadcastLobby(io, currentRoom);
    });
  });

  socket.on('set-wordlist', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      const data = safeParse(SetWordlistSchema, raw);
      if (!data) return;
      if (!data.words || data.words.length === 0) {
        currentRoom.customWords = null;
        currentRoom.categoryId = DEFAULT_CATEGORY;
        socket.emit('wordlist-status', { status: 'default' });
        broadcastLobby(io, currentRoom);
        return;
      }
      const validated = validateWordList(data.words);
      if (!validated) {
        socket.emit('wordlist-status', { status: 'error', message: 'Need at least 25 unique words' });
        return;
      }
      currentRoom.customWords = validated;
      currentRoom.categoryId = 'custom';
      socket.emit('wordlist-status', { status: 'custom', count: validated.length });
      broadcastLobby(io, currentRoom);
    });
  });

  socket.on('start-game', () => {
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;

      if (currentRoom.gameType === 'duet') {
        if (!currentRoom.playerA || !currentRoom.playerB) {
          socket.emit('error-msg', 'Need 2 players assigned to Player A and Player B');
          return;
        }
        const words = getWordsForGame(currentRoom.categoryId, currentRoom.difficulty, currentRoom.customWords);
        const duetGame = createDuetGame(words);
        currentRoom.game = duetGame;
        setDuetDeadline(duetGame, currentRoom.turnTimeout * 1000);
        startRoomTimer(io, currentRoom);
        broadcastState(io, currentRoom);
        return;
      }

      const reds = currentRoom.players.filter((p) => p.team === 'red');
      const blues = currentRoom.players.filter((p) => p.team === 'blue');
      if (reds.length < 1 || blues.length < 1) {
        socket.emit('error-msg', 'Each team needs at least 1 player');
        return;
      }
      if (!reds.find((p) => p.role === 'spymaster') || !blues.find((p) => p.role === 'spymaster')) {
        socket.emit('error-msg', 'Each team needs a spymaster');
        return;
      }
      const words = getWordsForGame(currentRoom.categoryId, currentRoom.difficulty, currentRoom.customWords);
      currentRoom.game = createGame(currentRoom.mode, words);
      setDeadline(currentRoom.game as GameState, currentRoom.turnTimeout * 1000);
      startRoomTimer(io, currentRoom);
      broadcastState(io, currentRoom);
    });
  });

  socket.on('give-clue', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom?.game) return;
      const data = safeParse(GiveClueSchema, raw);
      if (!data) return socket.emit('error-msg', 'Invalid clue');

      if (isDuetGame(currentRoom.game)) {
        const side = getDuetSide(currentRoom, playerId!);
        if (!side || side !== currentRoom.game.currentTurn) return;
        const result = submitDuetClue(currentRoom.game, data.word, data.count);
        if ('error' in result) return socket.emit('error-msg', result.error);
        setDuetDeadline(currentRoom.game, currentRoom.turnTimeout * 1000);
        broadcastState(io, currentRoom);
        return;
      }

      const me = currentRoom.players.find((p) => p.id === playerId);
      if (!me || me.role !== 'spymaster' || !me.team) return;
      const classic = currentRoom.game as GameState;
      const result = submitClue(classic, me.team, data.word, data.count);
      if ('error' in result) return socket.emit('error-msg', result.error);
      setDeadline(classic, currentRoom.turnTimeout * 1000);
      broadcastState(io, currentRoom);
    });
  });

  socket.on('cast-vote', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom?.game) return;
      if (isDuetGame(currentRoom.game)) return;
      const classic = currentRoom.game as GameState;
      const me = currentRoom.players.find((p) => p.id === playerId);
      if (!me || me.role !== 'operative' || !me.team) return;
      if (classic.currentTeam !== me.team) return;
      if (classic.phase !== 'operative') return;
      const data = safeParse(CardIndexSchema, raw);
      if (!data) return;
      const result = castVote(classic, data.cardIndex, me.id);
      if ('error' in result) return socket.emit('error-msg', result.error);
      broadcastState(io, currentRoom);
    });
  });

  socket.on('make-guess', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom?.game) return;
      const data = safeParse(CardIndexSchema, raw);
      if (!data) return;

      if (isDuetGame(currentRoom.game)) {
        const side = getDuetSide(currentRoom, playerId!);
        if (!side) return;
        const guesserSide = currentRoom.game.currentTurn === 'A' ? 'B' : 'A';
        if (side !== guesserSide) return;
        if (currentRoom.game.phase !== 'operative') return;
        const result = processDuetGuess(currentRoom.game, data.cardIndex);
        if ('error' in result) return socket.emit('error-msg', result.error);
        const over = currentRoom.game.winner !== null;
        if (result.result === 'neutral' || over) {
          setDuetDeadline(currentRoom.game, over ? 0 : currentRoom.turnTimeout * 1000);
        }
        broadcastState(io, currentRoom);
        return;
      }

      const classic = currentRoom.game as GameState;
      const me = currentRoom.players.find((p) => p.id === playerId);
      if (!me || !me.team) return;
      const solo = isSoloOnTeam(currentRoom, me);
      if (me.role !== 'operative' && !solo) return;
      if (classic.currentTeam !== me.team) return;
      if (classic.phase !== 'operative') return;
      if (!solo) {
        const majority = getVoteMajority(classic);
        if (majority === null || majority !== data.cardIndex) {
          return socket.emit('error-msg', 'No majority vote on that card');
        }
      }
      const result = processGuess(classic, data.cardIndex, me.team);
      if ('error' in result) return socket.emit('error-msg', result.error);
      const gameOver = result.result === 'assassin' || result.result === 'win';
      if ('switchedTo' in result || gameOver) {
        setDeadline(classic, gameOver ? 0 : currentRoom.turnTimeout * 1000);
      }
      broadcastState(io, currentRoom);
    });
  });

  socket.on('end-turn', () => {
    guarded(() => {
      if (!currentRoom?.game) return;

      if (isDuetGame(currentRoom.game)) {
        const side = getDuetSide(currentRoom, playerId!);
        if (!side) return;
        const guesserSide = currentRoom.game.currentTurn === 'A' ? 'B' : 'A';
        if (side !== guesserSide) return;
        const result = endDuetTurn(currentRoom.game);
        if ('error' in result) return socket.emit('error-msg', result.error);
        const over = currentRoom.game.winner !== null;
        setDuetDeadline(currentRoom.game, over ? 0 : currentRoom.turnTimeout * 1000);
        broadcastState(io, currentRoom);
        return;
      }

      const classic = currentRoom.game as GameState;
      const me = currentRoom.players.find((p) => p.id === playerId);
      if (!me || !me.team) return;
      const result = endTurn(classic, me.team);
      if ('error' in result) return socket.emit('error-msg', result.error);
      setDeadline(classic, currentRoom.turnTimeout * 1000);
      broadcastState(io, currentRoom);
    });
  });

  socket.on('send-chat', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom) return;
      const data = safeParse(SendChatSchema, raw);
      if (!data) return;
      const me = currentRoom.players.find((p) => p.id === playerId);
      if (!me) return;
      const msg: ChatMessage = {
        id: `${Date.now()}-${playerId}`,
        name: me.name,
        team: me.team,
        text: data.text.slice(0, 200),
        ts: Date.now(),
      };
      currentRoom.chatLog.push(msg);
      if (currentRoom.chatLog.length > MAX_CHAT_LOG) currentRoom.chatLog.shift();
      io.to(currentRoom.code).emit('chat-message', msg);
    });
  });

  socket.on('play-again', () => {
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      clearRoomTimer(currentRoom);
      currentRoom.game = null;
      broadcastLobby(io, currentRoom);
    });
  });

  socket.on('leave-room', () => {
    if (!currentRoom || !playerId) return;
    const room = currentRoom;
    const pid = playerId;

    cancelDisconnectTimer(pid);
    deleteSessionsForPlayer(pid);
    socket.leave(room.code);

    room.players = room.players.filter((p) => p.id !== pid);
    if (room.playerA === pid) room.playerA = null;
    if (room.playerB === pid) room.playerB = null;

    currentRoom = null;
    playerId = null;

    socket.emit('session-expired');

    if (room.players.length === 0) {
      clearRoomTimer(room);
      rooms.delete(room.code);
      return;
    }
    if (room.host === pid) room.host = room.players[0]!.id;
    broadcastLobby(io, room);
    if (room.game) broadcastState(io, room);
  });

  socket.on('disconnect', () => {
    if (!currentRoom || !playerId) return;
    const room = currentRoom;
    const pid = playerId;

    const player = room.players.find((p) => p.id === pid);
    if (player && player.socketId !== socket.id) return;

    const hasSession = [...sessions.values()].some((s) => s.playerId === pid);
    if (!hasSession) {
      room.players = room.players.filter((p) => p.id !== pid);
      if (room.players.length === 0) {
        clearRoomTimer(room);
        rooms.delete(room.code);
        return;
      }
      if (room.host === pid) room.host = room.players[0]!.id;
      broadcastLobby(io, room);
      if (room.game) broadcastState(io, room);
      return;
    }

    const timer = setTimeout(() => {
      disconnectTimers.delete(pid);
      deleteSessionsForPlayer(pid);
      room.players = room.players.filter((p) => p.id !== pid);
      if (room.players.length === 0) {
        clearRoomTimer(room);
        rooms.delete(room.code);
        return;
      }
      if (room.host === pid) room.host = room.players[0]!.id;
      if (room.playerA === pid) room.playerA = null;
      if (room.playerB === pid) room.playerB = null;
      broadcastLobby(io, room);
      if (room.game) broadcastState(io, room);
    }, DISCONNECT_GRACE_MS);
    disconnectTimers.set(pid, timer);
  });
}

export function startIdleSweep(io: Server): void {
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const last = roomLastActivity.get(code) ?? 0;
      if (now - last >= ROOM_IDLE_TTL_MS) {
        destroyRoom(room, io);
      }
    }
  }, 60_000);
}
