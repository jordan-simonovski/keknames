import type { TurnTimeout } from './types';

export const TURN_TIMEOUTS: readonly TurnTimeout[] = [0, 60, 120, 180, 300] as const;

export const MAX_AVATAR_ID = 8;

export function avatarUrl(id: number): string {
  return `/assets/ui/avatar_${String(id).padStart(2, '0')}.png`;
}
