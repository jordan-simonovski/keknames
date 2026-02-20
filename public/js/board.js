window.Board = (() => {
  const canvas = document.getElementById('game-board');
  const ctx = canvas.getContext('2d');
  let cards = [];
  let mode = 'words';
  let cols = 5;
  let rows = 5;
  let cardW = 0;
  let cardH = 0;
  let gap = 6;
  let offsetX = 0;
  let offsetY = 0;
  let isSpymaster = false;
  let onCardClick = null;
  let hoverIndex = -1;
  let revealAnimations = new Map();
  let currentVoteInfo = null;

  const COLORS = {
    red: { bg: '#c0392b', border: '#e74c3c', text: '#fff' },
    blue: { bg: '#2471a3', border: '#3498db', text: '#fff' },
    bystander: { bg: '#5d6d7e', border: '#7f8c8d', text: '#ddd' },
    assassin: { bg: '#1a1a1a', border: '#e74c3c', text: '#e74c3c' },
  };

  function resize(gameState) {
    if (!gameState) return;
    mode = gameState.mode;
    cols = gameState.config.cols;
    rows = gameState.config.rows;
    cards = gameState.cards;

    const wrapper = canvas.parentElement;
    const maxW = wrapper.clientWidth - 16;
    const maxH = wrapper.clientHeight - 16;

    const aspect = mode === 'pictures' ? 1 : 0.72;
    cardW = Math.floor((maxW - gap * (cols + 1)) / cols);
    cardH = Math.floor(cardW * aspect);
    if ((cardH * rows + gap * (rows + 1)) > maxH) {
      cardH = Math.floor((maxH - gap * (rows + 1)) / rows);
      cardW = Math.floor(cardH / aspect);
    }
    const maxCard = mode === 'pictures' ? 160 : 140;
    if (cardW > maxCard) { cardW = maxCard; cardH = Math.floor(cardW * aspect); }

    const totalW = cardW * cols + gap * (cols + 1);
    const totalH = cardH * rows + gap * (rows + 1);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = totalW + 'px';
    canvas.style.height = totalH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    offsetX = 0;
    offsetY = 0;
  }

  function getCardRect(index) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = offsetX + gap + col * (cardW + gap);
    const y = offsetY + gap + row * (cardH + gap);
    return { x, y, w: cardW, h: cardH };
  }

  function draw(gameState, spymaster, voteInfo) {
    if (!gameState) return;
    cards = gameState.cards;
    isSpymaster = spymaster;
    currentVoteInfo = voteInfo || null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < cards.length; i++) {
      drawCard(i);
    }
  }

  function drawCardFront(x, y, w, h, card) {
    const isHover = hoverIndex === cards.indexOf(card) && !card.revealed;
    ctx.fillStyle = isHover ? '#2a3a5a' : '#1e2d4d';
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();

    if (isSpymaster && card.type) {
      const colors = COLORS[card.type] || COLORS.bystander;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 3;
      roundRect(ctx, x, y, w, h, 6);
      ctx.stroke();
      ctx.fillStyle = colors.bg;
      ctx.globalAlpha = 0.15;
      roundRect(ctx, x, y, w, h, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = '#334';
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, h, 6);
      ctx.stroke();
    }

    if (mode === 'pictures') {
      const img = Assets.getImage(`/assets/cards/${card.content}.png`);
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
  }

  function drawCardBack(x, y, w, h, card) {
    const colors = COLORS[card.type] || COLORS.bystander;
    const typeMap = { red: 'red_agent', blue: 'blue_agent', bystander: 'bystander', assassin: 'assassin' };
    const baseName = typeMap[card.type] || 'bystander';
    const suffix = card.typeVariant && card.typeVariant > 1 ? `_${card.typeVariant}` : '';
    const typeImg = Assets.getImage(`/assets/ui/${baseName}${suffix}.png`);

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
    const label = mode === 'pictures' ? card.content.replace('card_', '#') : card.content;
    ctx.fillText(label, x + w / 2, y + h - labelH / 2);

    ctx.restore();

    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 6);
    ctx.stroke();
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function drawCard(index) {
    const card = cards[index];
    if (!card) return;
    const { x, y, w, h } = getCardRect(index);
    const anim = revealAnimations.get(index);
    const p = anim ? anim.progress : (card.revealed ? 1 : 0);

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
        drawCardFront(x, y, w, h, card);
        ctx.restore();
      } else {
        const scaleX = (ep - 0.5) * 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scaleX, 1);
        ctx.translate(-cx, -cy);
        drawCardBack(x, y, w, h, card);
        ctx.restore();
      }
    } else if (card.revealed) {
      drawCardBack(x, y, w, h, card);
    } else {
      drawCardFront(x, y, w, h, card);
    }

    if (!card.revealed && !anim && currentVoteInfo && currentVoteInfo.showVotes && !currentVoteInfo.isSolo) {
      const voters = currentVoteInfo.votes[index];
      const isMajority = currentVoteInfo.majority === index;

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
          const isMine = voters[vi] === currentVoteInfo.myId;
          const avId = currentVoteInfo.playerAvatars[voters[vi]];
          const avImg = avId ? Assets.getImage(`/assets/ui/avatar_${String(avId).padStart(2, '0')}.png`) : null;
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
  }

  function roundRect(ctx, x, y, w, h, r) {
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

  function hitTest(px, py) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = parseFloat(canvas.style.width) / rect.width;
    const scaleY = parseFloat(canvas.style.height) / rect.height;
    const x = (px - rect.left) * scaleX;
    const y = (py - rect.top) * scaleY;

    for (let i = 0; i < cards.length; i++) {
      const r = getCardRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return i;
      }
    }
    return -1;
  }

  canvas.addEventListener('click', (e) => {
    const idx = hitTest(e.clientX, e.clientY);
    if (idx >= 0 && onCardClick) onCardClick(idx);
  });

  canvas.addEventListener('touchend', (e) => {
    if (e.changedTouches.length === 0) return;
    const t = e.changedTouches[0];
    const idx = hitTest(t.clientX, t.clientY);
    if (idx >= 0 && onCardClick) {
      e.preventDefault();
      onCardClick(idx);
    }
  }, { passive: false });

  canvas.addEventListener('mousemove', (e) => {
    const idx = hitTest(e.clientX, e.clientY);
    if (idx !== hoverIndex) {
      hoverIndex = idx;
      if (cards.length > 0) draw({ mode, config: { cols, rows }, cards }, isSpymaster, currentVoteInfo);
    }
    canvas.style.cursor = idx >= 0 && cards[idx] && !cards[idx].revealed ? 'pointer' : 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    if (hoverIndex !== -1) {
      hoverIndex = -1;
      if (cards.length > 0) draw({ mode, config: { cols, rows }, cards }, isSpymaster, currentVoteInfo);
    }
  });

  function setClickHandler(fn) { onCardClick = fn; }

  function animateReveal(index, callback) {
    const duration = 600;
    const start = performance.now();
    revealAnimations.set(index, { progress: 0 });

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      revealAnimations.set(index, { progress });
      draw({ mode, config: { cols, rows }, cards }, isSpymaster, currentVoteInfo);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        revealAnimations.delete(index);
        if (callback) callback();
      }
    }
    requestAnimationFrame(tick);
  }

  return { resize, draw, setClickHandler, animateReveal, getCardRect };
})();
