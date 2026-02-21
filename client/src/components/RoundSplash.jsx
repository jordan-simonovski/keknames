import { useState, useEffect, useRef } from 'react';

const SPLASH_IMAGES = [
  '/assets/ui/round-start-mortalkombat.png',
  '/assets/ui/round-start-boxing.png',
  '/assets/ui/round-start-challenger.png',
];

export default function RoundSplash({ gameState }) {
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState(null);
  const turnRef = useRef(null);

  const turnKey = gameState
    ? `${gameState.currentTeam ?? ''}-${gameState.currentTurn ?? ''}`
    : null;

  useEffect(() => {
    if (!turnKey) return;
    if (turnRef.current === null) {
      turnRef.current = turnKey;
      setSrc(SPLASH_IMAGES[Math.floor(Math.random() * SPLASH_IMAGES.length)]);
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 2400);
      return () => clearTimeout(t);
    }
    if (turnRef.current !== turnKey) {
      turnRef.current = turnKey;
      setSrc(SPLASH_IMAGES[Math.floor(Math.random() * SPLASH_IMAGES.length)]);
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 2400);
      return () => clearTimeout(t);
    }
  }, [turnKey]);

  if (!visible || !src) return null;

  return (
    <div className="round-splash">
      <img className="round-splash-img" src={src} alt="" />
      <div className="round-splash-text">ROUND START</div>
    </div>
  );
}
