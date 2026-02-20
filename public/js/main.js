(() => {
  const socket = io();
  window.gameSocket = socket;
  Assets.preloadUI();

  const screens = {
    landing: document.getElementById('screen-landing'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
  };

  function showScreen(name) {
    for (const [k, el] of Object.entries(screens)) {
      el.classList.toggle('active', k === name);
    }
    if (name === 'game') {
      setTimeout(() => {
        Board.resize(window._lastGameState);
        Board.draw(window._lastGameState, window._lastGameState?.you?.role === 'spymaster');
      }, 50);
    }
  }

  const btnCreate = document.getElementById('btn-create');
  const btnJoin = document.getElementById('btn-join');
  const nameInput = document.getElementById('player-name');
  const codeInput = document.getElementById('room-code-input');

  btnCreate.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    socket.emit('create-room', { name }, (res) => {
      if (res.error) { alert(res.error); return; }
      Lobby.init(socket.id);
      showScreen('lobby');
    });
  });

  btnJoin.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const code = codeInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    if (!code) { codeInput.focus(); return; }
    socket.emit('join-room', { code, name }, (res) => {
      if (res.error) { alert(res.error); return; }
      Lobby.init(socket.id);
      if (res.inGame) {
        showScreen('game');
      } else {
        showScreen('lobby');
      }
    });
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnCreate.click();
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnJoin.click();
  });

  socket.on('lobby-state', (state) => {
    Lobby.update(state);
    if (screens.game.classList.contains('active') && !state.inGame) {
      showScreen('lobby');
    }
  });

  socket.on('game-state', (state) => {
    window._lastGameState = state;
    if (!screens.game.classList.contains('active')) {
      showScreen('game');
      Game.init();
    }
    if (state.mode === 'pictures') {
      const ids = state.cards.map((c) => c.content);
      Assets.preloadCards(ids).then(() => Game.update(state));
    } else {
      Game.update(state);
    }
  });

  socket.on('wordlist-status', (status) => Lobby.updateWordlistStatus(status));
  socket.on('error-msg', (msg) => {
    if (screens.game.classList.contains('active')) Game.showError(msg);
    else Lobby.showError(msg);
  });

  window.addEventListener('resize', () => {
    if (screens.game.classList.contains('active') && window._lastGameState) {
      Board.resize(window._lastGameState);
      Board.draw(window._lastGameState, window._lastGameState?.you?.role === 'spymaster');
    }
  });

  const connBanner = document.getElementById('connection-banner');
  socket.on('disconnect', () => {
    connBanner.textContent = 'Disconnected. Reconnecting...';
    connBanner.classList.add('visible');
  });
  socket.on('connect', () => {
    if (connBanner.classList.contains('visible')) {
      connBanner.textContent = 'Reconnected';
      setTimeout(() => connBanner.classList.remove('visible'), 2000);
    }
  });
})();
