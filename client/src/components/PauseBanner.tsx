import { useEffect, useState } from 'react';
import { useSocket } from '../useSocket';

export default function PauseBanner() {
  const { gameState } = useSocket();
  const [now, setNow] = useState(Date.now);
  const pause = gameState?.pause;
  useEffect(() => {
    if (!pause) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [pause]);
  if (!pause || !gameState) return null;
  const names = gameState.players
    .filter((p) => pause.missingPlayerIds.includes(p.id))
    .map((p) => p.name)
    .join(', ');
  return (
    <aside className="pause-banner">
      <strong role="status">Game paused — waiting for {names} to reconnect.</strong>
      <span>
        Returning to lobby in {Math.max(0, Math.ceil((pause.until - now) / 1000))}s. The turn clock is paused.
      </span>
    </aside>
  );
}
