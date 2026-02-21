import { useRef, useCallback, useEffect, useState } from 'react';

const SOUND_FILES = {
  round: '/assets/sounds/round.mp3',
  clue: '/assets/sounds/clue.mp3',
  correct: '/assets/sounds/correct.mp3',
  wrong: '/assets/sounds/wrong.mp3',
  tick: '/assets/sounds/tick.mp3',
  timeUp: '/assets/sounds/time-up.mp3',
  win: '/assets/sounds/win.mp3',
  lose: '/assets/sounds/lose.mp3',
};

const MUTE_KEY = 'keknames-muted';

export function useMuted() {
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(MUTE_KEY) === '1'; }
    catch { return false; }
  });

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return [muted, toggle];
}

export function useSounds(muted) {
  const cache = useRef({});
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const play = useCallback((name) => {
    if (mutedRef.current) return;
    const src = SOUND_FILES[name];
    if (!src) return;
    if (!cache.current[name]) {
      cache.current[name] = new Audio(src);
    }
    const audio = cache.current[name];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  return play;
}

export function useGameSounds(gameState, prevRef, play) {
  useEffect(() => {
    if (!gameState) return;
    const prev = prevRef.current;
    prevRef.current = gameState;
    if (!prev) {
      play('round');
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

    const prevRevealed = prev.cards?.filter((c) => c.revealed).length ?? 0;
    const nowRevealed = gameState.cards?.filter((c) => c.revealed).length ?? 0;
    if (nowRevealed > prevRevealed) {
      if (gameState.mode === 'duet') {
        const lastLog = gameState.log?.[gameState.log.length - 1];
        if (lastLog && 'cardType' in lastLog) {
          play(lastLog.cardType === 'green' ? 'correct' : 'wrong');
        }
      } else {
        const lastLog = gameState.log?.[gameState.log.length - 1];
        if (lastLog && 'cardType' in lastLog) {
          const myTeam = gameState.you?.team;
          play(lastLog.cardType === myTeam ? 'correct' : 'wrong');
        }
      }
      return;
    }

    if (prev.currentTurn !== gameState.currentTurn ||
        (prev.currentTeam && prev.currentTeam !== gameState.currentTeam)) {
      play('round');
    }
  }, [gameState, prevRef, play]);
}

export function useTickSound(timeLeft, muted) {
  const audioRef = useRef(null);
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

export function useTimeUpSound(timeLeft, play) {
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
