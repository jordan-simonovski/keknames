import { useState, useEffect, useRef } from 'react';
import type { GameViewPayload } from '@shared/types';

const SPLASH_IMAGES = [
  '/assets/ui/round-start-mortalkombat.png',
  '/assets/ui/round-start-boxing.png',
  '/assets/ui/round-start-challenger.png',
];

interface RoundSplashProps {
  gameState: GameViewPayload;
}

export default function RoundSplash({ gameState }: RoundSplashProps) {
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const prevEmpty = useRef<boolean | null>(null);

  const isNewGame = gameState ? gameState.log.length === 0 : false;

  useEffect(() => {
    if (!isNewGame) {
      prevEmpty.current = false;
      return;
    }
    if (prevEmpty.current) return;
    prevEmpty.current = true;
    setSrc(SPLASH_IMAGES[Math.floor(Math.random() * SPLASH_IMAGES.length)]!);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(t);
  }, [isNewGame]);

  if (!visible || !src) return null;

  return (
    <div className="round-splash">
      <img className="round-splash-img" src={src} alt="" />
      <div className="round-splash-text">ROUND START</div>
    </div>
  );
}
