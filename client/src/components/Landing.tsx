import { useState, useMemo, type CSSProperties } from 'react';
import { useSocket } from '../useSocket';

const FLOATING_IMAGES = [
  "/assets/ui/avatar_01.png",
  "/assets/ui/avatar_02.png",
  "/assets/ui/avatar_03.png",
  "/assets/ui/avatar_04.png",
  "/assets/ui/avatar_05.png",
  "/assets/ui/avatar_06.png",
  "/assets/ui/avatar_07.png",
  "/assets/ui/avatar_08.png",
  "/assets/ui/red_agent.png",
  "/assets/ui/blue_agent.png",
  "/assets/ui/bystander.png",
  "/assets/ui/assassin.png",
  ...Array.from({ length: 24 }, (_, i) => `/assets/cards/card_${String(i + 1).padStart(2, "0")}.png`),
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function FloatingBackdrop() {
  const items = useMemo(() => {
    const rng = seededRandom(42);
    return Array.from({ length: 28 }, (_, i) => {
      const src = FLOATING_IMAGES[i % FLOATING_IMAGES.length]!;
      const isCard = src.includes("/cards/");
      return {
        key: i,
        src,
        size: isCard ? 70 + rng() * 60 : 40 + rng() * 50,
        left: rng() * 100,
        top: rng() * 100,
        delay: rng() * 14,
        duration: 6 + rng() * 8,
        drift: -30 + rng() * 60,
        isCard,
      };
    });
  }, []);

  return (
    <div className="floating-backdrop" aria-hidden="true">
      {items.map((it) => (
        <img
          key={it.key}
          className={`floating-avatar${it.isCard ? " floating-card" : ""}`}
          src={it.src}
          alt=""
          style={
            {
              width: `${it.size}px`,
              left: `${it.left}%`,
              top: `${it.top}%`,
              animationDelay: `${it.delay}s`,
              animationDuration: `${it.duration}s`,
              "--drift": `${it.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export default function Landing() {
  const { createRoom, joinRoom } = useSocket();
  const [name, setName] = useState("");
  const [code, setCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("room") || "").toUpperCase().slice(0, 4);
  });
  const [err, setErr] = useState("");
  const [hasRoomFromUrl, setHasRoomFromUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("room") || "").length > 0;
  });

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      await createRoom(name.trim());
    } catch (e) {
      setErr(String(e));
    }
  }

  async function handleJoin() {
    if (!name.trim() || !code.trim()) return;
    try {
      await joinRoom(code.trim(), name.trim());
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <div className="screen landing-screen">
      <FloatingBackdrop />
      <div className="landing-container">
        <h1 className="logo">KEKNAMES</h1>
        <p className="tagline">codenames but kekw</p>
        <div className="landing-form">
          <input
            type="text"
            placeholder="Your name"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (hasRoomFromUrl ? handleJoin() : handleCreate())}
            autoFocus={hasRoomFromUrl}
            autoComplete="off"
          />
          {hasRoomFromUrl ? (
            <>
              <div className="join-invite">
                Joining room <strong>{code}</strong>
              </div>
              <button className="btn btn-primary" onClick={handleJoin}>
                Join Room
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setHasRoomFromUrl(false);
                  setCode("");
                  setErr("");
                  window.history.replaceState(null, "", window.location.pathname);
                }}
              >
                Back to Menu
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={handleCreate}>
                Create Room
              </button>
              <div className="join-row">
                <input
                  type="text"
                  placeholder="ROOM CODE"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  autoComplete="off"
                />
                <button className="btn btn-secondary" onClick={handleJoin}>
                  Join
                </button>
              </div>
            </>
          )}
          {err && <p className="error-msg">{err}</p>}
        </div>
      </div>
    </div>
  );
}
