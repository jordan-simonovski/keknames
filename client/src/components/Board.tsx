import { useRef, useEffect, useCallback } from 'react';
import type { CardView, GameMode, BoardConfig } from '@shared/types';

interface VoteInfo {
  votes: Record<string, string[]>;
  majority: number | null;
  myVote: number | null;
  myId: string;
  isSolo: boolean;
  showVotes: boolean;
  playerAvatars: Record<string, number>;
}

interface BoardProps {
  gameState: {
    cards: CardView[];
    mode: GameMode;
    config: BoardConfig;
  };
  isSpymaster: boolean;
  voteInfo: VoteInfo | null;
  onCardClick?: (index: number) => void;
}

const COLORS: Record<string, { bg: string; border: string; text: string }> = {
  red: { bg: '#c0392b', border: '#e74c3c', text: '#fff' },
  blue: { bg: '#2471a3', border: '#3498db', text: '#fff' },
  bystander: { bg: '#5d6d7e', border: '#7f8c8d', text: '#ddd' },
  assassin: { bg: '#1a1a1a', border: '#ffffff', text: '#ff4444' },
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

const imageCache = new Map<string, HTMLImageElement | null>();
function getImage(src: string): HTMLImageElement | null {
  if (imageCache.has(src)) return imageCache.get(src)!;
  const img = new Image();
  img.src = src;
  img.onload = () => imageCache.set(src, img);
  img.onerror = () => imageCache.set(src, null);
  return null;
}

function preloadImages(srcs: string[]) {
  srcs.forEach((src) => {
    if (!imageCache.has(src)) {
      const img = new Image();
      img.src = src;
      img.onload = () => imageCache.set(src, img);
      img.onerror = () => imageCache.set(src, null);
    }
  });
}

const TYPE_SRCS = [
  'red_agent',
  'red_agent_2',
  'red_agent_3',
  'red_agent_4',
  'red_agent_5',
  'blue_agent',
  'blue_agent_2',
  'blue_agent_3',
  'blue_agent_4',
  'blue_agent_5',
  'bystander',
  'bystander_2',
  'bystander_3',
  'bystander_4',
  'bystander_5',
  'assassin',
  'assassin_2',
].map((n) => `/assets/ui/${n}.png`);
const AVATAR_SRCS = Array.from({ length: 8 }, (_, i) => `/assets/ui/avatar_${String(i + 1).padStart(2, '0')}.png`);
preloadImages([...TYPE_SRCS, ...AVATAR_SRCS]);

interface BoardState {
  cards: CardView[];
  mode: string;
  cols: number;
  rows: number;
  cardW: number;
  cardH: number;
  gap: number;
  hoverIndex: number;
  revealAnimations: Map<number, { progress: number }>;
  isSpymaster: boolean;
  voteInfo: VoteInfo | null;
}

export default function Board({ gameState, isSpymaster, voteInfo, onCardClick }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<BoardState>({
    cards: [],
    mode: 'words',
    cols: 5,
    rows: 5,
    cardW: 0,
    cardH: 0,
    gap: 6,
    hoverIndex: -1,
    revealAnimations: new Map(),
    isSpymaster: false,
    voteInfo: null,
  });
  const prevCardsRef = useRef<CardView[] | null>(null);
  const rafRef = useRef<number | null>(null);

  const getCardRect = useCallback((index: number) => {
    const s = stateRef.current;
    const col = index % s.cols;
    const row = Math.floor(index / s.cols);
    const x = s.gap + col * (s.cardW + s.gap);
    const y = s.gap + row * (s.cardH + s.gap);
    return { x, y, w: s.cardW, h: s.cardH };
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = stateRef.current;
    const wrapper = canvas.parentElement;
    if (!wrapper) return;
    const maxW = wrapper.clientWidth - 16;
    const maxH = wrapper.clientHeight - 16;

    const aspect = s.mode === 'pictures' ? 1 : 0.72;
    s.cardW = Math.floor((maxW - s.gap * (s.cols + 1)) / s.cols);
    s.cardH = Math.floor(s.cardW * aspect);
    if (s.cardH * s.rows + s.gap * (s.rows + 1) > maxH) {
      s.cardH = Math.floor((maxH - s.gap * (s.rows + 1)) / s.rows);
      s.cardW = Math.floor(s.cardH / aspect);
    }

    const totalW = s.cardW * s.cols + s.gap * (s.cols + 1);
    const totalH = s.cardH * s.rows + s.gap * (s.rows + 1);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = totalW + 'px';
    canvas.style.height = totalH + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const drawCardFront = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, card: CardView, isHover: boolean) => {
      const s = stateRef.current;
      ctx.fillStyle = isHover ? '#2a3a5a' : '#1e2d4d';
      roundRect(ctx, x, y, w, h, 6);
      ctx.fill();

      if (s.isSpymaster && card.type) {
        const colors = COLORS[card.type] || COLORS['bystander']!;
        const isAssassin = card.type === 'assassin';
        ctx.fillStyle = colors.bg;
        ctx.globalAlpha = isAssassin ? 0.45 : 0.15;
        roundRect(ctx, x, y, w, h, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = isAssassin ? 4 : 3;
        roundRect(ctx, x, y, w, h, 6);
        ctx.stroke();
        if (isAssassin) {
          const skull = '\u2620';
          const iconSize = Math.floor(Math.min(w, h) * 0.22);
          ctx.font = `${iconSize}px sans-serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#ff4444';
          ctx.fillText(skull, x + w - 6, y + 4);
        }
      } else {
        ctx.strokeStyle = '#334';
        ctx.lineWidth = 1;
        roundRect(ctx, x, y, w, h, 6);
        ctx.stroke();
      }

      if (s.mode === 'pictures') {
        const img = getImage(`/assets/cards/${card.content}.png`);
        if (img) {
          ctx.save();
          roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 4);
          ctx.clip();
          ctx.drawImage(img, x + 3, y + 3, w - 6, h - 6);
          ctx.restore();
        } else {
          ctx.fillStyle = '#556';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(card.content, x + w / 2, y + h / 2);
        }
      } else {
        ctx.fillStyle = '#e0e0e0';
        const fontSize = Math.floor(Math.min(w * 0.13, 18));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(card.content, x + w / 2, y + h / 2);
      }
    },
    [],
  );

  const drawCardBack = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, card: CardView) => {
      const s = stateRef.current;
      const colors = COLORS[card.type ?? 'bystander'] || COLORS['bystander']!;
      const typeMap: Record<string, string> = {
        red: 'red_agent',
        blue: 'blue_agent',
        bystander: 'bystander',
        assassin: 'assassin',
      };
      const baseName = typeMap[card.type ?? 'bystander'] || 'bystander';
      const suffix = card.typeVariant && card.typeVariant > 1 ? `_${card.typeVariant}` : '';
      const typeImg = getImage(`/assets/ui/${baseName}${suffix}.png`);

      ctx.save();
      roundRect(ctx, x, y, w, h, 6);
      ctx.clip();

      if (typeImg) {
        const iw = typeImg.width || w;
        const ih = typeImg.height || h;
        const scale = Math.max(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.drawImage(typeImg, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = colors.bg;
        ctx.fillRect(x, y, w, h);
      }

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const labelH = Math.floor(h * 0.2);
      ctx.fillRect(x, y + h - labelH, w, labelH);
      ctx.fillStyle = '#fff';
      const labelFont = Math.floor(Math.min(w * 0.1, labelH * 0.6));
      ctx.font = `bold ${labelFont}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = s.mode === 'pictures' ? card.content.replace('card_', '#') : card.content;
      ctx.fillText(label, x + w / 2, y + h - labelH / 2);
      ctx.restore();

      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 3;
      roundRect(ctx, x, y, w, h, 6);
      ctx.stroke();
    },
    [],
  );

  const drawCard = useCallback(
    (ctx: CanvasRenderingContext2D, index: number) => {
      const s = stateRef.current;
      const card = s.cards[index];
      if (!card) return;
      const { x, y, w, h } = getCardRect(index);
      const isHover = s.hoverIndex === index && !card.revealed;
      const anim = s.revealAnimations.get(index);
      const p = anim ? anim.progress : card.revealed ? 1 : 0;

      ctx.save();

      if (anim) {
        const ep = easeOutCubic(p);
        const cx = x + w / 2;
        const cy = y + h / 2;
        if (ep < 0.5) {
          const scaleX = 1 - ep * 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(scaleX, 1);
          ctx.translate(-cx, -cy);
          drawCardFront(ctx, x, y, w, h, card, false);
          ctx.restore();
        } else {
          const scaleX = (ep - 0.5) * 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(scaleX, 1);
          ctx.translate(-cx, -cy);
          drawCardBack(ctx, x, y, w, h, card);
          ctx.restore();
        }
      } else if (card.revealed) {
        drawCardBack(ctx, x, y, w, h, card);
      } else {
        drawCardFront(ctx, x, y, w, h, card, isHover);
      }

      if (!card.revealed && !anim && s.voteInfo && s.voteInfo.showVotes && !s.voteInfo.isSolo) {
        const voters = s.voteInfo.votes[index];
        const isMajority = s.voteInfo.majority === index;

        if (isMajority) {
          ctx.save();
          ctx.strokeStyle = '#f39c12';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#f39c12';
          ctx.shadowBlur = 8;
          roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 8);
          ctx.stroke();
          ctx.restore();
        }
        if (voters && voters.length > 0) {
          const avatarSize = Math.max(16, Math.floor(w * 0.14));
          const pad = 3;
          for (let vi = 0; vi < voters.length; vi++) {
            const isMine = voters[vi] === s.voteInfo.myId;
            const avId = s.voteInfo.playerAvatars?.[voters[vi]!];
            const avImg = avId ? getImage(`/assets/ui/avatar_${String(avId).padStart(2, '0')}.png`) : null;
            const ax = x + w - (vi + 1) * (avatarSize + pad);
            const ay = y + pad;
            ctx.save();
            ctx.beginPath();
            ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.clip();
            if (avImg) {
              ctx.drawImage(avImg, ax, ay, avatarSize, avatarSize);
            } else {
              ctx.fillStyle = isMine ? '#f39c12' : '#aaa';
              ctx.fill();
            }
            ctx.restore();
            ctx.beginPath();
            ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.strokeStyle = isMine ? '#f39c12' : '#fff';
            ctx.lineWidth = isMine ? 2 : 1;
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    },
    [getCardRect, drawCardFront, drawCardBack],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const s = stateRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < s.cards.length; i++) {
      drawCard(ctx, i);
    }
  }, [drawCard]);

  const animateReveal = useCallback(
    (index: number, callback?: () => void) => {
      const s = stateRef.current;
      const duration = 600;
      const start = performance.now();
      s.revealAnimations.set(index, { progress: 0 });

      function tick(now: number) {
        const progress = Math.min((now - start) / duration, 1);
        s.revealAnimations.set(index, { progress });
        draw();
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          s.revealAnimations.delete(index);
          if (callback) callback();
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [draw],
  );

  const hitTest = useCallback(
    (px: number, py: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return -1;
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = parseFloat(canvas.style.width) / rect.width;
      const scaleY = parseFloat(canvas.style.height) / rect.height;
      const mx = (px - rect.left) * scaleX;
      const my = (py - rect.top) * scaleY;
      for (let i = 0; i < s.cards.length; i++) {
        const r = getCardRect(i);
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return i;
      }
      return -1;
    },
    [getCardRect],
  );

  useEffect(() => {
    if (!gameState) return;
    const s = stateRef.current;
    s.cards = gameState.cards;
    s.mode = gameState.mode;
    s.cols = gameState.config.cols;
    s.rows = gameState.config.rows;
    s.isSpymaster = isSpymaster;
    s.voteInfo = voteInfo;

    if (gameState.mode === 'pictures') {
      preloadImages(gameState.cards.map((c) => `/assets/cards/${c.content}.png`));
    }

    const prev = prevCardsRef.current;
    let revealedIdx = -1;
    if (prev) {
      for (let i = 0; i < gameState.cards.length; i++) {
        if (gameState.cards[i]!.revealed && !prev[i]?.revealed) {
          revealedIdx = i;
          break;
        }
      }
    }
    prevCardsRef.current = gameState.cards.map((c) => ({ ...c }));

    resize();
    if (revealedIdx >= 0) {
      animateReveal(revealedIdx, () => draw());
    } else {
      draw();
    }
  }, [gameState, isSpymaster, voteInfo, resize, draw, animateReveal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleClick(e: MouseEvent) {
      const idx = hitTest(e.clientX, e.clientY);
      if (idx >= 0 && onCardClick) onCardClick(idx);
    }

    function handleTouchEnd(e: TouchEvent) {
      if (e.changedTouches.length === 0) return;
      const t = e.changedTouches[0]!;
      const idx = hitTest(t.clientX, t.clientY);
      if (idx >= 0 && onCardClick) {
        e.preventDefault();
        onCardClick(idx);
      }
    }

    function handleMouseMove(e: MouseEvent) {
      const s = stateRef.current;
      const idx = hitTest(e.clientX, e.clientY);
      if (idx !== s.hoverIndex) {
        s.hoverIndex = idx;
        draw();
      }
      canvas!.style.cursor = idx >= 0 && s.cards[idx] && !s.cards[idx]!.revealed ? 'pointer' : 'default';
    }

    function handleMouseLeave() {
      const s = stateRef.current;
      if (s.hoverIndex !== -1) {
        s.hoverIndex = -1;
        draw();
      }
    }

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    const observer = new ResizeObserver(() => {
      resize();
      draw();
    });
    observer.observe(canvas.parentElement!);

    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [onCardClick, draw, hitTest, resize]);

  return <canvas ref={canvasRef} className="game-board" />;
}
