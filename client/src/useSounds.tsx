import { useRef, useCallback, useEffect, useState, type MutableRefObject } from 'react';
import type { GameViewPayload } from '@shared/types';

type SoundName = 'round' | 'clue' | 'correct' | 'wrong' | 'tick' | 'timeUp' | 'win' | 'lose' | 'redAnnounce' | 'blueAnnounce';

const SOUND_FILES: Record<SoundName, string> = {
  round: '/assets/sounds/round.mp3',
  clue: '/assets/sounds/clue.mp3',
  correct: '/assets/sounds/correct.mp3',
  wrong: '/assets/sounds/wrong.mp3',
  tick: '/assets/sounds/tick.mp3',
  timeUp: '/assets/sounds/time-up.mp3',
  win: '/assets/sounds/winner-winner.mp3',
  lose: '/assets/sounds/lose.mp3',
  redAnnounce: '/assets/sounds/red-team-announce.mp3',
  blueAnnounce: '/assets/sounds/blue-team-announce.mp3',
};

const MUTE_KEY = 'keknames-muted';
const MUSIC_MUTE_KEY = 'keknames-music-muted';
const MUSIC_VOLUME = 0.12;

export function useMuted(): [boolean, () => void] {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return [muted, toggle];
}

export function useMusicMuted(): [boolean, () => void] {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUSIC_MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUSIC_MUTE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return [muted, toggle];
}

export function useBackgroundMusic(active: boolean, musicMuted: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (active && !musicMuted) {
      if (!audioRef.current) {
        audioRef.current = new Audio('/assets/sounds/background-music.mp3');
        audioRef.current.loop = true;
        audioRef.current.volume = MUSIC_VOLUME;
      }
      audioRef.current.play().catch(() => {});
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [active, musicMuted]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);
}

export function useSounds(muted: boolean): (name: SoundName) => void {
  const cache = useRef<Partial<Record<SoundName, HTMLAudioElement>>>({});
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const play = useCallback((name: SoundName) => {
    if (mutedRef.current) return;
    const src = SOUND_FILES[name];
    if (!src) return;
    if (!cache.current[name]) {
      cache.current[name] = new Audio(src);
    }
    const audio = cache.current[name]!;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  return play;
}

export function useGameSounds(
  gameState: GameViewPayload | null,
  prevRef: MutableRefObject<GameViewPayload | null>,
  play: (name: SoundName) => void,
) {
  const soundedLogLen = useRef(0);

  useEffect(() => {
    if (!gameState) return;
    const prev = prevRef.current;
    prevRef.current = gameState;
    if (!prev) {
      soundedLogLen.current = gameState.log?.length ?? 0;
      if ('currentTeam' in gameState) {
        play(gameState.currentTeam === 'red' ? 'redAnnounce' : 'blueAnnounce');
      } else {
        play('round');
      }
      return;
    }

    if (prev.phase === 'spymaster' && gameState.phase === 'operative') {
      play('clue');
      return;
    }

    if (gameState.phase === 'gameover' && prev.phase !== 'gameover') {
      const me = gameState.you;
      if (gameState.mode === 'duet') {
        play(gameState.winner === 'win' ? 'win' : 'lose');
      } else if (me?.team && gameState.winner === me.team) {
        play('win');
      } else {
        play('lose');
      }
      return;
    }

    const logLen = gameState.log?.length ?? 0;
    if (logLen > soundedLogLen.current) {
      soundedLogLen.current = logLen;
      const lastLog = gameState.log[logLen - 1];
      if (lastLog && 'cardType' in lastLog) {
        if (gameState.mode === 'duet') {
          play(lastLog.cardType === 'green' ? 'correct' : 'wrong');
        } else if ('team' in lastLog) {
          play(lastLog.cardType === lastLog.team ? 'correct' : 'wrong');
        }
        return;
      }
    }

    if ('currentTeam' in prev && 'currentTeam' in gameState && prev.currentTeam !== gameState.currentTeam) {
      play(gameState.currentTeam === 'red' ? 'redAnnounce' : 'blueAnnounce');
    } else if ('currentTurn' in prev && 'currentTurn' in gameState && prev.currentTurn !== gameState.currentTurn) {
      play('round');
    }
  }, [gameState, prevRef, play]);
}

export function useTickSound(timeLeft: number | null, muted: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(false);

  useEffect(() => {
    const shouldPlay = !muted && timeLeft !== null && timeLeft > 0 && timeLeft <= 30;

    if (shouldPlay && !playingRef.current) {
      if (!audioRef.current) {
        audioRef.current = new Audio('/assets/sounds/tick.mp3');
        audioRef.current.loop = true;
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      playingRef.current = true;
    } else if (!shouldPlay && playingRef.current) {
      audioRef.current?.pause();
      playingRef.current = false;
    }
  }, [timeLeft, muted]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      playingRef.current = false;
    };
  }, []);
}

export function useTimeUpSound(timeLeft: number | null, play: (name: SoundName) => void) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (timeLeft === null) {
      firedRef.current = false;
      return;
    }
    if (timeLeft === 0 && !firedRef.current) {
      firedRef.current = true;
      play('timeUp');
    }
    if (timeLeft > 0) {
      firedRef.current = false;
    }
  }, [timeLeft, play]);
}
