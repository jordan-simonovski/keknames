import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { z } from 'zod';
import {
  broadcastRoomControls,
  requestAdmission,
  resolveAdmission,
  cancelSocketAdmission,
  cancelRoomAdmissions,
} from './admission';
import { windowLimiter } from './rate-limit';
import {
  createGame,
  processGuess,
  submitClue,
  endTurn,
  getPlayerView,
  castVote,
  getVoteMajority,
  clearVotes,
  switchTurn,
  setDeadline,
} from './game';
import {
  createDuetGame,
  submitDuetClue,
  processDuetGuess,
  endDuetTurn,
  getDuetPlayerView,
  setDuetDeadline,
  skipDuetTurn,
} from './duet';
import { validateWordList, getWordsForGame, CATEGORY_LIST, DEFAULT_CATEGORY, DEFAULT_DIFFICULTY } from './wordlists';
import type { Room, Player, ChatMessage, Team, DuetState, GameState, DuetSide } from './types';
import {
  SetAccessSchema,
  ReviewJoinSchema,
  RemovePlayerSchema,
  UnblockPlayerSchema,
  CreateRoomSchema,
  JoinRoomSchema,
  AssignTeamSchema,
  SetModeSchema,
  SetCategorySchema,
  SetWordlistSchema,
  GiveClueSchema,
  CardIndexSchema,
  SendChatSchema,
  SetTimeoutSchema,
  SetGameTypeSchema,
} from './types';

const rooms = new Map<string, Room>();
const allowAdmission = windowLimiter(120, 60_000);

const roomTimers = new Map<string, ReturnType<typeof setInterval>>();
const roomLastActivity = new Map<string, number>();

interface Session {
  playerId: string;
  roomCode: string;
}
const sessions = new Map<string, Session>();
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DISCONNECT_GRACE_MS = 60_000;

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_LEN = 6;
const MAX_ROOMS = 1000;
const MAX_PLAYERS = 10;
const MAX_BLOCKED_SESSIONS = 100;
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
  cancelRoomAdmissions(io, room);
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
    accessMode: 'open',
    blockedSessions: new Map(),
    pause: null,
    pauseRemainingMs: DISCONNECT_GRACE_MS,
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
  touchRoom(room);
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
  return (
    player.role === 'operative' &&
    player.team !== null &&
    room.players.filter((p) => p.connected && p.team === player.team && p.role === 'operative').length === 1
  );
}

function classicReady(room: Room): boolean {
  return (['red', 'blue'] as const).every((team) => {
    const players = room.players.filter((p) => p.team === team);
    return (
      players.filter((p) => p.role === 'spymaster').length === 1 &&
      players.some((p) => p.connected && p.role === 'operative') &&
      players.filter((p) => p.role === 'spymaster').every((p) => p.connected)
    );
  });
}

function removeVotes(room: Room, pid: string): void {
  if (!room.game || !isClassicGame(room.game)) return;
  for (const [index, voters] of Object.entries(room.game.votes)) {
    room.game.votes[index] = voters.filter((id) => id !== pid);
    if (!room.game.votes[index]!.length) delete room.game.votes[index];
  }
}

function buildRoomMeta(room: Room) {
  const avatarMap: Record<string, number> = {};
  for (const pl of room.players) avatarMap[pl.id] = pl.avatarId;
  const roster = room.players.map((pl) => ({
    id: pl.id,
    name: pl.name,
    team: pl.team,
    role: pl.role,
    avatarId: pl.avatarId,
    connected: pl.connected,
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
        pause: pauseView(room),
        chatLog: room.chatLog,
        playerAvatars: avatarMap,
        players: roster,
        you: {
          id: p.id,
          name: p.name,
          team: p.team,
          role: p.role,
          isHost: p.id === room.host,
          isSolo: false,
          avatarId: p.avatarId,
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
      votes: p.team === classic.currentTeam ? view.votes : {},
      roomCode: room.code,
      pause: pauseView(room),
      chatLog: room.chatLog,
      playerAvatars: avatarMap,
      players: roster,
      you: {
        id: p.id,
        name: p.name,
        team: p.team,
        role: p.role,
        isHost: p.id === room.host,
        isSolo: solo,
        avatarId: p.avatarId,
      },
    });
  }
}

function broadcastLobby(io: Server, room: Room): void {
  const data = {
    code: room.code,
    accessMode: room.accessMode,
    gameType: room.gameType,
    mode: room.mode,
    categoryId: room.categoryId,
    difficulty: room.difficulty,
    turnTimeout: room.turnTimeout,
    categories: CATEGORY_LIST,
    playerA: room.playerA,
    playerB: room.playerB,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      role: p.role,
      isHost: p.id === room.host,
      avatarId: p.avatarId,
      connected: p.connected,
    })),
    hostId: room.host,
    inGame: !!room.game,
  };
  io.to(room.code).emit('lobby-state', data);
  broadcastRoomControls(io, room);
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
  room.pause = null;
  room.pauseRemainingMs = DISCONNECT_GRACE_MS;
  const interval = setInterval(() => {
    expireTurn(io, room);
  }, 1_000);
  roomTimers.set(room.code, interval);
}

function expireTurn(io: Server, room: Room): boolean {
  if (room.pause) {
    if (Date.now() >= room.pause.expiresAt) {
      returnToLobby(io, room, 'Reconnect time expired. Reassign players in the lobby to continue.');
      return true;
    }
    return false;
  }
  const game = room.game;
  if (!game || game.winner || game.turnDeadline === null || Date.now() < game.turnDeadline) return false;
  if (isDuetGame(game)) {
    skipDuetTurn(game);
    setDuetDeadline(game, game.winner ? 0 : room.turnTimeout * 1000);
  } else {
    switchTurn(game);
    setDeadline(game, room.turnTimeout * 1000);
  }
  broadcastState(io, room);
  return true;
}

function missingEssentialPlayers(room: Room): Player[] {
  if (room.gameType === 'duet')
    return room.players.filter((p) => !p.connected && (p.id === room.playerA || p.id === room.playerB));
  return room.players.filter(
    (p) =>
      !p.connected &&
      p.team &&
      (p.role === 'spymaster' ||
        (p.role === 'operative' &&
          !room.players.some((other) => other.connected && other.team === p.team && other.role === 'operative'))),
  );
}

function pauseView(room: Room) {
  return room.pause
    ? { until: room.pause.expiresAt, missingPlayerIds: missingEssentialPlayers(room).map((p) => p.id) }
    : null;
}

function returnToLobby(io: Server, room: Room, reason?: string): void {
  clearRoomTimer(room);
  room.pause = null;
  room.game = null;
  if (reason) io.to(room.code).emit('error-msg', reason);
  broadcastLobby(io, room);
}

function updatePause(io: Server, room: Room): void {
  if (!room.game || room.game.winner) return;
  const seatsPresent =
    room.gameType === 'duet'
      ? !!room.playerA && !!room.playerB
      : (['red', 'blue'] as const).every((team) =>
          ['spymaster', 'operative'].every((role) => room.players.some((p) => p.team === team && p.role === role)),
        );
  if (!seatsPresent)
    return returnToLobby(io, room, 'An essential player left. Reassign players in the lobby to continue.');
  if (room.pause && Date.now() >= room.pause.expiresAt) {
    return returnToLobby(io, room, 'Reconnect time expired. Reassign players in the lobby to continue.');
  }
  if (missingEssentialPlayers(room).length) {
    if (!room.pause) {
      if (room.pauseRemainingMs <= 0)
        return returnToLobby(io, room, 'Reconnect time expired. Reassign players in the lobby to continue.');
      const now = Date.now();
      room.pause = {
        startedAt: now,
        expiresAt: now + room.pauseRemainingMs,
        remainingTurnMs: room.game.turnDeadline === null ? null : Math.max(0, room.game.turnDeadline - now),
      };
      room.game.turnDeadline = null;
    }
  } else if (room.pause) {
    room.pauseRemainingMs = Math.max(0, room.pauseRemainingMs - (Date.now() - room.pause.startedAt));
    room.game.turnDeadline = room.pause.remainingTurnMs === null ? null : Date.now() + room.pause.remainingTurnMs;
    room.pause = null;
  }
}

function removePlayer(io: Server, room: Room, pid: string): void {
  cancelDisconnectTimer(pid);
  deleteSessionsForPlayer(pid);
  const player = room.players.find((p) => p.id === pid);
  if (player) io.sockets.sockets.get(player.socketId)?.leave(room.code);
  room.players = room.players.filter((p) => p.id !== pid);
  removeVotes(room, pid);
  if (room.playerA === pid) room.playerA = null;
  if (room.playerB === pid) room.playerB = null;
  if (!room.players.length) return destroyRoom(room, io);
  if (room.host === pid) room.host = (room.players.find((p) => p.connected) ?? room.players[0])!.id;
  updatePause(io, room);
  broadcastLobby(io, room);
  if (room.game) broadcastState(io, room);
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
    if (s.playerId === pid) {
      sessions.delete(token);
      break;
    }
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
  let pending = false;
  let currentToken = parseCookies(socket.handshake.headers.cookie)['keknames_session'];

  function ownsSession(): boolean {
    return (
      !!currentRoom &&
      rooms.get(currentRoom.code) === currentRoom &&
      currentRoom.players.some((p) => p.id === playerId && p.socketId === socket.id && p.connected)
    );
  }

  function guarded(handler: () => void): void {
    if (
      currentRoom &&
      (rooms.get(currentRoom.code) !== currentRoom || !currentRoom.players.some((p) => p.id === playerId))
    ) {
      currentRoom = null;
      playerId = null;
    }
    if (currentRoom && !ownsSession()) return;
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
        const previousSocket = io.sockets.sockets.get(player.socketId);
        player.socketId = socket.id;
        player.connected = true;
        if (previousSocket && previousSocket.id !== socket.id) {
          previousSocket.emit('session-replaced');
          previousSocket.leave(room.code);
          previousSocket.disconnect(true);
        }
        currentRoom = room;
        playerId = player.id;
        socket.join(room.code);
        touchRoom(room);
        updatePause(io, room);
        socket.emit('rejoined', { code: room.code, playerId: player.id, inGame: !!room.game });
        broadcastLobby(io, room);
        if (room.game) broadcastState(io, room);
      } else {
        sessions.delete(incomingToken);
        socket.emit('session-expired');
      }
    } else if (![...rooms.values()].some((room) => room.blockedSessions.has(incomingToken))) {
      socket.emit('session-expired');
    }
  }

  socket.on('create-room', (raw: unknown, cb: unknown) => {
    if (typeof cb !== 'function') return;
    guarded(() => {
      if (currentRoom || pending) return (cb as Function)({ error: 'Already in a room or awaiting approval' });
      if (!allowAdmission(socket.handshake.address))
        return (cb as Function)({ error: 'Too many room requests. Try again in a minute.' });
      const data = safeParse(CreateRoomSchema, raw);
      if (!data) return (cb as Function)({ error: 'Invalid input' });
      if (rooms.size >= MAX_ROOMS) return (cb as Function)({ error: 'Server full. Please try again later.' });
      const room = createRoom();
      const pid = randomUUID();
      const token = randomUUID();
      const player: Player = {
        id: pid,
        socketId: socket.id,
        connected: true,
        name: data.name.slice(0, 20),
        team: null,
        role: 'operative',
        avatarId: nextAvatarId(room),
      };
      room.players.push(player);
      room.host = player.id;
      currentRoom = room;
      playerId = player.id;
      currentToken = token;
      sessions.set(token, { playerId: pid, roomCode: room.code });
      socket.join(room.code);
      (cb as Function)({ code: room.code, sessionToken: token, playerId: pid });
      broadcastLobby(io, room);
    });
  });

  socket.on('join-room', (raw: unknown, cb: unknown) => {
    if (typeof cb !== 'function') return;
    guarded(() => {
      if (currentRoom || pending) return (cb as Function)({ error: 'Already in a room or awaiting approval' });
      if (!allowAdmission(socket.handshake.address))
        return (cb as Function)({ error: 'Too many room requests. Try again in a minute.' });
      const data = safeParse(JoinRoomSchema, raw);
      if (!data) return (cb as Function)({ error: 'Invalid input' });
      const roomCode = data.code.toUpperCase();
      const room = rooms.get(roomCode);
      if (!room) return (cb as Function)({ error: 'Room not found' });
      if (room.players.length >= MAX_PLAYERS) return (cb as Function)({ error: 'Room full' });
      if (room.players.find((p) => p.name.toLocaleLowerCase() === data.name.toLocaleLowerCase())) {
        return (cb as Function)({ error: 'Name taken' });
      }

      if (currentToken && room.blockedSessions.has(currentToken))
        return (cb as Function)({ error: 'You are blocked from this room' });
      if (room.accessMode === 'locked') return (cb as Function)({ error: 'Room is locked' });
      const admit = (respond: (result: object) => void) => {
        const error =
          rooms.get(room.code) !== room
            ? 'Room no longer exists'
            : room.accessMode === 'locked'
              ? 'Room is locked'
              : room.players.length >= MAX_PLAYERS
                ? 'Room full'
                : room.players.some((p) => p.name.toLocaleLowerCase() === data.name.toLocaleLowerCase())
                  ? 'Name taken'
                  : currentToken && room.blockedSessions.has(currentToken)
                    ? 'You are blocked from this room'
                    : null;
        if (error) return respond({ error });
        const pid = randomUUID();
        const token = randomUUID();
        const joiningMidGame = !!room.game;
        const player: Player = {
          id: pid,
          socketId: socket.id,
          connected: true,
          name: data.name,
          team: null,
          role: joiningMidGame ? 'spectator' : 'operative',
          avatarId: nextAvatarId(room),
        };
        room.players.push(player);
        currentRoom = room;
        playerId = pid;
        currentToken = token;
        sessions.set(token, { playerId: pid, roomCode: room.code });
        socket.join(room.code);
        touchRoom(room);
        respond({ code: room.code, inGame: joiningMidGame, sessionToken: token, playerId: pid });
        broadcastLobby(io, room);
        if (room.game) broadcastState(io, room);
      };
      if (room.accessMode === 'approval') {
        pending = true;
        const id = requestAdmission(io, room, socket, data.name, (approved, reason) => {
          pending = false;
          if (approved) admit((result) => socket.emit('join-approved', result));
          else socket.emit('join-rejected', reason ?? 'The host declined your request.');
        });
        if (!id) {
          pending = false;
          return (cb as Function)({ error: 'Too many pending requests. Try again later.' });
        }
        return (cb as Function)({ code: room.code, pending: true });
      }
      admit(cb as (result: object) => void);
    });
  });

  socket.on('set-access', (raw: unknown) =>
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      const data = safeParse(SetAccessSchema, raw);
      if (!data) return;
      currentRoom.accessMode = data.mode;
      if (data.mode === 'locked') cancelRoomAdmissions(io, currentRoom);
      broadcastLobby(io, currentRoom);
    }),
  );
  socket.on('review-join', (raw: unknown) =>
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      const data = safeParse(ReviewJoinSchema, raw);
      if (data) resolveAdmission(io, currentRoom, data.requestId, data.approve);
    }),
  );
  socket.on('remove-player', (raw: unknown) =>
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      const data = safeParse(RemovePlayerSchema, raw);
      if (!data || data.targetId === playerId) return;
      const player = currentRoom.players.find((p) => p.id === data.targetId);
      if (!player) return;
      if (data.ban && currentRoom.blockedSessions.size >= MAX_BLOCKED_SESSIONS) {
        socket.emit('error-msg', 'Block list full. Unblock someone or lock the room before removing more players.');
        return;
      }
      if (data.ban)
        for (const [token, session] of sessions) {
          if (session.playerId === player.id)
            currentRoom.blockedSessions.set(token, { id: player.id, name: player.name });
        }
      io.to(player.socketId).emit('removed-from-room', {
        blocked: data.ban,
        message: data.ban ? 'The host blocked you from this room.' : 'The host removed you from this room.',
      });
      removePlayer(io, currentRoom, player.id);
    }),
  );
  socket.on('unblock-player', (raw: unknown) =>
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      const data = safeParse(UnblockPlayerSchema, raw);
      if (!data) return;
      for (const [token, player] of currentRoom.blockedSessions)
        if (player.id === data.targetId) currentRoom.blockedSessions.delete(token);
      broadcastRoomControls(io, currentRoom);
    }),
  );

  socket.on('assign-team', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom || currentRoom.game || currentRoom.gameType !== 'classic') return;
      const data = safeParse(AssignTeamSchema, raw);
      if (!data) return;
      if (data.targetId !== playerId && playerId !== currentRoom.host) return;
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
      if (p.role === 'spectator') p.team = null;
      broadcastLobby(io, currentRoom);
    });
  });

  socket.on('set-mode', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom || currentRoom.game || playerId !== currentRoom.host) return;
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
      if (!currentRoom || currentRoom.game || currentRoom.gameType !== 'duet') return;
      const data = safeParse(AssignTeamSchema, raw);
      if (!data) return;
      const targetId = data.targetId;
      if (targetId !== playerId && playerId !== currentRoom.host) return;
      const occupant = data.team === 'red' ? currentRoom.playerA : data.team === 'blue' ? currentRoom.playerB : null;
      if (occupant && occupant !== targetId && playerId !== currentRoom.host) return;
      const p = currentRoom.players.find((pl) => pl.id === targetId);
      if (!p) return;
      const slot = data.team;
      if (slot === 'red') {
        if (currentRoom.playerA === targetId) {
          currentRoom.playerA = null;
        } else {
          if (currentRoom.playerB === targetId) currentRoom.playerB = null;
          currentRoom.playerA = targetId;
        }
      } else if (slot === 'blue') {
        if (currentRoom.playerB === targetId) {
          currentRoom.playerB = null;
        } else {
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
      if (!currentRoom || currentRoom.game || playerId !== currentRoom.host) return;
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
      if (!currentRoom || currentRoom.game || playerId !== currentRoom.host) return;
      const data = safeParse(SetTimeoutSchema, raw);
      if (!data) return;
      currentRoom.turnTimeout = data.seconds;
      broadcastLobby(io, currentRoom);
    });
  });

  socket.on('set-wordlist', (raw: unknown) => {
    guarded(() => {
      if (!currentRoom || currentRoom.game || playerId !== currentRoom.host) return;
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
      if (currentRoom.game) return;

      if (currentRoom.gameType === 'duet') {
        if (
          ![currentRoom.playerA, currentRoom.playerB].every((id) =>
            currentRoom!.players.some((p) => p.id === id && p.connected),
          )
        ) {
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

      if (!classicReady(currentRoom)) {
        socket.emit('error-msg', 'Each team needs exactly one spymaster and at least one operative');
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
      if (expireTurn(io, currentRoom)) return socket.emit('error-msg', 'Time is up. Your action was not applied.');
      if (currentRoom.pause) return socket.emit('error-msg', 'Game paused while a player reconnects.');
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
      if (expireTurn(io, currentRoom)) return socket.emit('error-msg', 'Time is up. Your action was not applied.');
      if (currentRoom.pause) return socket.emit('error-msg', 'Game paused while a player reconnects.');
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
      if (expireTurn(io, currentRoom)) return socket.emit('error-msg', 'Time is up. Your action was not applied.');
      if (currentRoom.pause) return socket.emit('error-msg', 'Game paused while a player reconnects.');
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
      if (me.role !== 'operative') return;
      if (classic.currentTeam !== me.team) return;
      if (classic.phase !== 'operative') return;
      if (!solo) {
        const eligible = currentRoom.players.filter((p) => p.connected && p.team === me.team && p.role === 'operative');
        const majority = getVoteMajority(
          classic,
          eligible.map((p) => p.id),
        );
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
      if (expireTurn(io, currentRoom)) return socket.emit('error-msg', 'Time is up. Your action was not applied.');
      if (currentRoom.pause) return socket.emit('error-msg', 'Game paused while a player reconnects.');

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
      if (!me || !me.team || me.role !== 'operative') return;
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
        id: randomUUID(),
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
      if (!currentRoom.game?.winner) return;
      clearRoomTimer(currentRoom);

      if (currentRoom.gameType === 'duet') {
        if (
          ![currentRoom.playerA, currentRoom.playerB].every((id) =>
            currentRoom!.players.some((p) => p.id === id && p.connected),
          )
        ) {
          currentRoom.game = null;
          broadcastLobby(io, currentRoom);
          return;
        }
        const words = getWordsForGame(currentRoom.categoryId, currentRoom.difficulty, currentRoom.customWords);
        currentRoom.game = createDuetGame(words);
        setDuetDeadline(currentRoom.game as DuetState, currentRoom.turnTimeout * 1000);
        startRoomTimer(io, currentRoom);
        broadcastState(io, currentRoom);
        return;
      }

      if (!classicReady(currentRoom)) {
        currentRoom.game = null;
        broadcastLobby(io, currentRoom);
        return;
      }
      const words = getWordsForGame(currentRoom.categoryId, currentRoom.difficulty, currentRoom.customWords);
      currentRoom.game = createGame(currentRoom.mode, words);
      setDeadline(currentRoom.game as GameState, currentRoom.turnTimeout * 1000);
      startRoomTimer(io, currentRoom);
      broadcastState(io, currentRoom);
    });
  });

  socket.on('back-to-lobby', () => {
    guarded(() => {
      if (!currentRoom || playerId !== currentRoom.host) return;
      returnToLobby(io, currentRoom);
    });
  });

  socket.on('leave-room', () => {
    cancelSocketAdmission(io, socket.id);
    if (!currentRoom || !playerId || !ownsSession()) return;
    const room = currentRoom;
    const pid = playerId;
    currentRoom = null;
    playerId = null;
    socket.emit('session-expired');
    removePlayer(io, room, pid);
  });

  socket.on('disconnect', () => {
    cancelSocketAdmission(io, socket.id);
    if (!currentRoom || !playerId || !ownsSession()) return;
    const room = currentRoom;
    const pid = playerId;
    const player = room.players.find((p) => p.id === pid)!;
    // Apply an already elapsed deadline before preserving the clock.
    expireTurn(io, room);
    player.connected = false;
    removeVotes(room, pid);
    updatePause(io, room);
    broadcastLobby(io, room);
    if (room.game) broadcastState(io, room);
    const timer = setTimeout(() => removePlayer(io, room, pid), DISCONNECT_GRACE_MS);
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
