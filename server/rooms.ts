import { randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { z } from 'zod';
import {
  createGame, processGuess, submitClue, endTurn,
  getPlayerView, castVote, getVoteMajority, clearVotes,
  switchTurn, setDeadline,
} from './game';
import { validateWordList, getWordsForGame, CATEGORY_LIST, DEFAULT_CATEGORY, DEFAULT_DIFFICULTY } from './wordlists';
import type { Room, Player, ChatMessage, Team } from './types';
import {
  CreateRoomSchema, JoinRoomSchema, AssignTeamSchema,
  SetModeSchema, SetCategorySchema, SetWordlistSchema, GiveClueSchema,
  CardIndexSchema, SendChatSchema, SetTimeoutSchema,
} from './types';

const rooms = new Map<string, Room>();

const roomTimers = new Map<string, ReturnType<typeof setInterval>>();
const roomLastActivity = new Map<string, number>();

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
    const s = io.sockets.sockets.get(p.socketId);
    if (s) {
      s.emit('error-msg', 'Room closed due to inactivity');
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
    mode: 'words',
    categoryId: DEFAULT_CATEGORY,
    difficulty: DEFAULT_DIFFICULTY,
    customWords: null,
    turnTimeout: 0,
    game: null,
    chatLog: [],
  };
  rooms.set(code, room);
  return room;
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
  for (const p of room.players) {
    const solo = isSoloOnTeam(room, p);
    const view = getPlayerView(room.game, p.role);
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
    mode: room.mode,
    categoryId: room.categoryId,
    difficulty: room.difficulty,
    turnTimeout: room.turnTimeout,
    categories: CATEGORY_LIST,
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
    switchTurn(game);
    setDeadline(game, room.turnTimeout * 1000);
    broadcastState(io, room);
  }, 1_000);
  roomTimers.set(room.code, interval);
}

function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
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

  socket.on('create-room', (raw: unknown, cb: unknown) => {
    if (typeof cb !== 'function') return;
    guarded(() => {
      const data = safeParse(CreateRoomSchema, raw);
      if (!data) return (cb as Function)({ error: 'Invalid input' });
      const room = createRoom();
      const player: Player = {
        id: socket.id, socketId: socket.id,
        name: data.name.slice(0, 20), team: null, role: 'operative',
        avatarId: nextAvatarId(room),
      };
      room.players.push(player);
      room.host = player.id;
      currentRoom = room;
      playerId = player.id;
      socket.join(room.code);
      (cb as Function)({ code: room.code });
      broadcastLobby(io, room);
    });
  });

  socket.on('join-room', (raw: unknown, cb: unknown) => {
    if (typeof cb !== 'function') return;
    guarded(() => {
      const data = safeParse(JoinRoomSchema, raw);
      if (!data) return (cb as Function)({ error: 'Invalid input' });
      const roomCode = data.code.toUpperCase();
      const room = rooms.get(roomCode);
      if (!room) return (cb as Function)({ error: 'Room not found' });
      if (room.players.length >= MAX_PLAYERS) return (cb as Function)({ error: 'Room full' });
      if (room.players.find((p) => p.name === data.name)) {
        return (cb as Function)({ error: 'Name taken' });
      }

      const joiningMidGame = !!room.game;
      const player: Player = {
        id: socket.id, socketId: socket.id,
        name: data.name.slice(0, 20), team: null,
        role: joiningMidGame ? 'spectator' : 'operative',
        avatarId: nextAvatarId(room),
      };
      room.players.push(player);
      currentRoom = room;
      playerId = player.id;
      socket.join(room.code);
      (cb as Function)({ code: room.code, inGame: joiningMidGame });
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
          you: {
            id: player.id, name: player.name, team: player.team, role: player.role,
            isHost: player.id === room.host, isSolo: solo, avatarId: player.avatarId,
          },
        });
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
      setDeadline(currentRoom.game, currentRoom.turnTimeout * 1000);
      startRoomTimer(io, currentRoom);
      broadcastState(io, currentRoom);
    });
  });

  socket.on('give-clue', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom?.game) return;
      const me = currentRoom.players.find((p) => p.id === playerId);
      if (!me || me.role !== 'spymaster' || !me.team) return;
      const data = safeParse(GiveClueSchema, raw);
      if (!data) return socket.emit('error-msg', 'Invalid clue');
      const result = submitClue(currentRoom.game, me.team, data.word, data.count);
      if ('error' in result) return socket.emit('error-msg', result.error);
      setDeadline(currentRoom.game, currentRoom.turnTimeout * 1000);
      broadcastState(io, currentRoom);
    });
  });

  socket.on('cast-vote', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom?.game) return;
      const me = currentRoom.players.find((p) => p.id === playerId);
      if (!me || me.role !== 'operative' || !me.team) return;
      if (currentRoom.game.currentTeam !== me.team) return;
      if (currentRoom.game.phase !== 'operative') return;
      const data = safeParse(CardIndexSchema, raw);
      if (!data) return;
      const result = castVote(currentRoom.game, data.cardIndex, me.id);
      if ('error' in result) return socket.emit('error-msg', result.error);
      broadcastState(io, currentRoom);
    });
  });

  socket.on('make-guess', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom?.game) return;
      const me = currentRoom.players.find((p) => p.id === playerId);
      if (!me || !me.team) return;
      const solo = isSoloOnTeam(currentRoom, me);
      if (me.role !== 'operative' && !solo) return;
      if (currentRoom.game.currentTeam !== me.team) return;
      if (currentRoom.game.phase !== 'operative') return;
      const data = safeParse(CardIndexSchema, raw);
      if (!data) return;
      if (!solo) {
        const majority = getVoteMajority(currentRoom.game);
        if (majority === null || majority !== data.cardIndex) {
          return socket.emit('error-msg', 'No majority vote on that card');
        }
      }
      const result = processGuess(currentRoom.game, data.cardIndex, me.team);
      if ('error' in result) return socket.emit('error-msg', result.error);
      const gameOver = result.result === 'assassin' || result.result === 'win';
      if ('switchedTo' in result || gameOver) {
        setDeadline(currentRoom.game, gameOver ? 0 : currentRoom.turnTimeout * 1000);
      }
      broadcastState(io, currentRoom);
    });
  });

  socket.on('end-turn', () => {
    guarded(() => {
      if (!currentRoom?.game) return;
      const me = currentRoom.players.find((p) => p.id === playerId);
      if (!me || !me.team) return;
      const result = endTurn(currentRoom.game, me.team);
      if ('error' in result) return socket.emit('error-msg', result.error);
      setDeadline(currentRoom.game, currentRoom.turnTimeout * 1000);
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

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    currentRoom.players = currentRoom.players.filter((p) => p.id !== playerId);
    if (currentRoom.players.length === 0) {
      clearRoomTimer(currentRoom);
      rooms.delete(currentRoom.code);
      return;
    }
    if (currentRoom.host === playerId) {
      currentRoom.host = currentRoom.players[0]!.id;
    }
    broadcastLobby(io, currentRoom);
    if (currentRoom.game) broadcastState(io, currentRoom);
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
