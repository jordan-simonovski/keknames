window.Lobby = (() => {
  const socket = () => window.gameSocket;

  const els = {
    code: document.getElementById('lobby-code'),
    hostControls: document.getElementById('host-controls'),
    modeWords: document.getElementById('mode-words'),
    modePictures: document.getElementById('mode-pictures'),
    wordlistSection: document.getElementById('wordlist-section'),
    customWords: document.getElementById('custom-words'),
    btnSetWords: document.getElementById('btn-set-words'),
    wordlistStatus: document.getElementById('wordlist-status-text'),
    teamRed: document.getElementById('team-red-list'),
    teamBlue: document.getElementById('team-blue-list'),
    teamNone: document.getElementById('team-none-list'),
    btnStart: document.getElementById('btn-start'),
    error: document.getElementById('lobby-error'),
  };

  let lobbyState = null;
  let myId = null;
  let initialized = false;

  function init(id) {
    myId = id;
    if (initialized) return;
    initialized = true;

    socket().on('connect', () => { myId = socket().id; });

    els.modeWords.addEventListener('click', () => socket().emit('set-mode', { mode: 'words' }));
    els.modePictures.addEventListener('click', () => socket().emit('set-mode', { mode: 'pictures' }));

    els.btnSetWords.addEventListener('click', () => {
      const text = els.customWords.value.trim();
      if (!text) {
        socket().emit('set-wordlist', { words: [] });
        return;
      }
      const words = text.split(/\n/).map((w) => w.trim()).filter(Boolean);
      socket().emit('set-wordlist', { words });
    });

    els.btnStart.addEventListener('click', () => socket().emit('start-game'));
  }

  function update(state) {
    lobbyState = state;
    els.code.textContent = state.code;

    const isHost = state.hostId === myId;
    els.hostControls.style.display = isHost ? '' : 'none';
    els.btnStart.style.display = isHost ? '' : 'none';

    els.modeWords.classList.toggle('active', state.mode === 'words');
    els.modePictures.classList.toggle('active', state.mode === 'pictures');
    els.wordlistSection.style.display = state.mode === 'words' ? '' : 'none';

    renderTeam(els.teamRed, state.players.filter((p) => p.team === 'red'), 'red', isHost);
    renderTeam(els.teamBlue, state.players.filter((p) => p.team === 'blue'), 'blue', isHost);
    renderTeam(els.teamNone, state.players.filter((p) => !p.team), null, isHost);
  }

  function renderTeam(container, players, team, isHost) {
    container.innerHTML = '';
    for (const p of players) {
      const card = document.createElement('div');
      card.className = 'player-card';

      const avSrc = p.avatarId ? `/assets/ui/avatar_${String(p.avatarId).padStart(2, '0')}.png` : '';
      let html = '';
      if (avSrc) html += `<img class="player-avatar" src="${avSrc}" alt="" width="28" height="28">`;
      html += `<span class="player-name">${esc(p.name)}</span>`;
      if (p.isHost) html += `<span class="host-badge">HOST</span>`;

      if (team) {
        const roleClass = p.role === 'spymaster' ? 'spymaster' : '';
        html += `<span class="player-role ${roleClass}" data-id="${p.id}" data-team="${team}">${p.role === 'spymaster' ? 'SPYMASTER' : 'operative'}</span>`;
      }

      if (isHost || p.id === myId) {
        html += `<span class="team-btns">`;
        if (team !== 'red') html += `<button class="to-red" data-id="${p.id}" data-to="red" title="Move to Red">R</button>`;
        if (team !== 'blue') html += `<button class="to-blue" data-id="${p.id}" data-to="blue" title="Move to Blue">B</button>`;
        html += `</span>`;
      }

      card.innerHTML = html;
      container.appendChild(card);
    }

    container.querySelectorAll('.to-red, .to-blue').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket().emit('assign-team', { targetId: btn.dataset.id, team: btn.dataset.to });
      });
    });

    container.querySelectorAll('.player-role').forEach((el) => {
      el.addEventListener('click', () => {
        const current = el.textContent.trim() === 'SPYMASTER' ? 'spymaster' : 'operative';
        const next = current === 'spymaster' ? 'operative' : 'spymaster';
        socket().emit('assign-team', { targetId: el.dataset.id, role: next });
      });
    });
  }

  function showError(msg) {
    els.error.textContent = msg;
    setTimeout(() => { els.error.textContent = ''; }, 4000);
  }

  function updateWordlistStatus(status) {
    if (status.status === 'default') els.wordlistStatus.textContent = 'Using default (observability)';
    else if (status.status === 'custom') els.wordlistStatus.textContent = `Custom: ${status.count} words`;
    else if (status.status === 'error') els.wordlistStatus.textContent = status.message;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  return { init, update, showError, updateWordlistStatus };
})();
