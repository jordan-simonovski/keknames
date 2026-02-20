window.Game = (() => {
  const socket = () => window.gameSocket;

  const els = {
    redRemaining: document.getElementById('red-remaining'),
    blueRemaining: document.getElementById('blue-remaining'),
    turnIndicator: document.getElementById('turn-indicator'),
    clueDisplay: document.getElementById('clue-display'),
    clueWord: document.getElementById('clue-word'),
    clueCount: document.getElementById('clue-count'),
    guessesRemaining: document.getElementById('guesses-remaining'),
    spymasterControls: document.getElementById('spymaster-controls'),
    operativeControls: document.getElementById('operative-controls'),
    clueInput: document.getElementById('clue-input'),
    clueNumber: document.getElementById('clue-number'),
    btnGiveClue: document.getElementById('btn-give-clue'),
    btnEndTurn: document.getElementById('btn-end-turn'),
    gameOverOverlay: document.getElementById('game-over-overlay'),
    winnerText: document.getElementById('winner-text'),
    btnPlayAgain: document.getElementById('btn-play-again'),
    btnBackLobby: document.getElementById('btn-back-lobby'),
    gameError: document.getElementById('game-error'),
  };

  let currentState = null;
  let me = null;
  let initialized = false;

  function getMajority(votes) {
    if (!votes) return null;
    let best = null, bestCount = 0, tied = false;
    for (const [idx, voters] of Object.entries(votes)) {
      if (voters.length > bestCount) {
        best = parseInt(idx, 10);
        bestCount = voters.length;
        tied = false;
      } else if (voters.length === bestCount) {
        tied = true;
      }
    }
    return (tied || bestCount === 0) ? null : best;
  }

  function getMyVote(votes, myId) {
    if (!votes) return null;
    for (const [idx, voters] of Object.entries(votes)) {
      if (voters.includes(myId)) return parseInt(idx, 10);
    }
    return null;
  }

  function init() {
    if (initialized) return;
    initialized = true;

    els.btnGiveClue.addEventListener('click', () => {
      const word = els.clueInput.value.trim();
      const count = parseInt(els.clueNumber.value, 10);
      if (!word) return;
      socket().emit('give-clue', { word, count });
      els.clueInput.value = '';
    });

    els.clueInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') els.btnGiveClue.click();
    });

    els.btnEndTurn.addEventListener('click', () => socket().emit('end-turn'));
    els.btnPlayAgain.addEventListener('click', () => socket().emit('play-again'));
    els.btnBackLobby.addEventListener('click', () => socket().emit('play-again'));

    Board.setClickHandler((idx) => {
      if (!currentState || !me) return;
      const canAct = me.role === 'operative' || me.isSolo;
      if (!canAct) return;
      if (currentState.currentTeam !== me.team) return;
      if (currentState.phase !== 'operative') return;
      const card = currentState.cards[idx];
      if (card.revealed) return;

      if (me.isSolo) {
        socket().emit('make-guess', { cardIndex: idx });
        return;
      }

      const majority = getMajority(currentState.votes);
      const myVote = getMyVote(currentState.votes, me.id);
      if (majority === idx && myVote === idx) {
        socket().emit('make-guess', { cardIndex: idx });
      } else {
        socket().emit('cast-vote', { cardIndex: idx });
      }
    });
  }

  function update(state) {
    const prevCards = currentState ? currentState.cards : null;
    currentState = state;
    me = state.you;

    els.redRemaining.textContent = state.redRemaining;
    els.blueRemaining.textContent = state.blueRemaining;

    const turnLabel = state.winner
      ? (state.winner.toUpperCase() + ' WINS')
      : (state.currentTeam.toUpperCase() + (state.phase === 'spymaster' ? ' - Spymaster' : ' - Guessing'));
    els.turnIndicator.textContent = turnLabel;
    els.turnIndicator.className = 'turn-indicator ' + (state.currentTeam === 'red' ? 'red-turn' : 'blue-turn');

    if (state.currentClue) {
      els.clueDisplay.style.display = '';
      els.clueWord.textContent = state.currentClue.word;
      els.clueCount.textContent = state.currentClue.count;
      els.guessesRemaining.textContent = state.guessesRemaining;
    } else {
      els.clueDisplay.style.display = 'none';
    }

    const isMyTurn = state.currentTeam === me.team && !state.winner;
    const isSpymaster = me.role === 'spymaster';
    const isSolo = me.isSolo;

    els.spymasterControls.style.display =
      isSpymaster && isMyTurn && state.phase === 'spymaster' ? 'flex' : 'none';
    els.operativeControls.style.display =
      isMyTurn && state.phase === 'operative' && (!isSpymaster || isSolo) ? '' : 'none';

    if (state.winner) {
      els.gameOverOverlay.style.display = 'flex';
      const lastLog = state.log[state.log.length - 1];
      const reason = lastLog && lastLog.cardType === 'assassin' ? ' (Assassin)' : '';
      els.winnerText.textContent = state.winner.toUpperCase() + ' TEAM WINS' + reason;
      els.winnerText.style.color = state.winner === 'red' ? '#e74c3c' : '#3498db';
      els.btnPlayAgain.style.display = me.isHost ? '' : 'none';
      els.btnBackLobby.textContent = me.isHost ? 'Back to Lobby' : 'Waiting for host...';
      els.btnBackLobby.disabled = !me.isHost;
    } else {
      els.gameOverOverlay.style.display = 'none';
    }

    const voteInfo = {
      votes: state.votes || {},
      majority: getMajority(state.votes),
      myVote: getMyVote(state.votes, me.id),
      myId: me.id,
      isSolo: me.isSolo,
      showVotes: state.phase === 'operative' && state.currentTeam === me.team && (me.role === 'operative' || me.isSolo),
      playerAvatars: state.playerAvatars || {},
    };

    if (prevCards) {
      let revealed = -1;
      for (let i = 0; i < state.cards.length; i++) {
        if (state.cards[i].revealed && prevCards[i] && !prevCards[i].revealed) {
          revealed = i;
          break;
        }
      }
      if (revealed >= 0) {
        Board.animateReveal(revealed, () => {
          Board.draw(state, isSpymaster, voteInfo);
        });
        return;
      }
    }

    Board.resize(state);
    Board.draw(state, isSpymaster, voteInfo);
  }

  function showError(msg) {
    els.gameError.textContent = msg;
    setTimeout(() => { els.gameError.textContent = ''; }, 4000);
  }

  return { init, update, showError };
})();
