import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { Room } from './types';

interface JoinRequest {
  id: string;
  room: Room;
  socketId: string;
  name: string;
  finish: (approved: boolean, reason?: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

const requests = new Map<string, JoinRequest>();

export function broadcastRoomControls(io: Server, room: Room): void {
  const host = room.players.find((p) => p.id === room.host);
  if (!host) return;
  io.to(host.socketId).emit('room-controls', {
    code: room.code,
    accessMode: room.accessMode,
    requests: [...requests.values()].filter((r) => r.room === room).map(({ id, name }) => ({ id, name })),
    blockedPlayers: [...room.blockedSessions.values()],
  });
}

export function requestAdmission(
  io: Server,
  room: Room,
  socket: Socket,
  name: string,
  finish: JoinRequest['finish'],
): string | null {
  if ([...requests.values()].filter((r) => r.room === room).length >= 10) return null;
  const id = randomUUID();
  const timer = setTimeout(
    () => resolveAdmission(io, room, id, false, 'Join request expired. Please try again.'),
    120_000,
  );
  requests.set(id, { id, room, socketId: socket.id, name, finish, timer });
  broadcastRoomControls(io, room);
  return id;
}

export function resolveAdmission(io: Server, room: Room, id: string, approved: boolean, reason?: string): void {
  const request = requests.get(id);
  if (!request || request.room !== room) return;
  requests.delete(id);
  clearTimeout(request.timer);
  request.finish(approved, reason);
  broadcastRoomControls(io, room);
}

export function cancelSocketAdmission(io: Server, socketId: string): void {
  for (const request of requests.values()) {
    if (request.socketId === socketId) resolveAdmission(io, request.room, request.id, false, 'Join request cancelled.');
  }
}

export function cancelRoomAdmissions(io: Server, room: Room): void {
  for (const request of requests.values()) {
    if (request.room === room)
      resolveAdmission(io, room, request.id, false, 'This room is no longer accepting requests.');
  }
}
