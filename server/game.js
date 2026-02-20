const { OBSERVABILITY, validateWordList } = require('./wordlists');

const CARD_TYPES = { RED: 'red', BLUE: 'blue', BYSTANDER: 'bystander', ASSASSIN: 'assassin' };

const PICTURES_CONFIG = { rows: 4, cols: 5, total: 20, starting: 8, other: 7, bystanders: 4, assassins: 1 };
const WORDS_CONFIG = { rows: 5, cols: 5, total: 25, starting: 9, other: 8, bystanders: 7, assassins: 1 };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateKeyCard(config, startingTeam) {
  const other = startingTeam === 'red' ? 'blue' : 'red';
  const types = [
    ...Array(config.starting).fill(startingTeam),
    ...Array(config.other).fill(other),
    ...Array(config.bystanders).fill(CARD_TYPES.BYSTANDER),
    ...Array(config.assassins).fill(CARD_TYPES.ASSASSIN),
  ];
  return shuffle(types);
}

function getImagePool() {
  const ids = [];
  for (let i = 1; i <= 24; i++) {
    ids.push(`card_${String(i).padStart(2, '0')}`);
  }
  return ids;
}

function createGame(mode, customWords) {
  const config = mode === 'pictures' ? PICTURES_CONFIG : WORDS_CONFIG;
  const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
  const keyCard = generateKeyCard(config, startingTeam);

  let cardContents;
  if (mode === 'pictures') {
    const pool = getImagePool();
    cardContents = shuffle(pool).slice(0, config.total);
  } else {
    const wordPool = customWords && customWords.length >= 25 ? customWords : OBSERVABILITY;
    cardContents = shuffle(wordPool).slice(0, config.total);
  }

  const VARIANT_COUNTS = { red: 3, blue: 3, bystander: 3, assassin: 1 };
  const cards = cardContents.map((content, i) => ({
    id: i,
    content,
    type: keyCard[i],
    revealed: false,
    typeVariant: Math.floor(Math.random() * VARIANT_COUNTS[keyCard[i]]) + 1,
  }));

  return {
    mode,
    config,
    cards,
    startingTeam,
    currentTeam: startingTeam,
    phase: 'spymaster',
    currentClue: null,
    guessesRemaining: 0,
    redRemaining: cards.filter((c) => c.type === 'red').length,
    blueRemaining: cards.filter((c) => c.type === 'blue').length,
    winner: null,
    log: [],
    votes: {},
  };
}

function castVote(game, cardIndex, playerId) {
  if (game.winner) return { error: 'Game is over' };
  if (game.phase !== 'operative') return { error: 'Not guessing phase' };
  const card = game.cards[cardIndex];
  if (!card) return { error: 'Invalid card' };
  if (card.revealed) return { error: 'Already revealed' };

  for (const idx of Object.keys(game.votes)) {
    game.votes[idx] = game.votes[idx].filter((id) => id !== playerId);
    if (game.votes[idx].length === 0) delete game.votes[idx];
  }
  if (!game.votes[cardIndex]) game.votes[cardIndex] = [];
  game.votes[cardIndex].push(playerId);
  return { result: 'ok' };
}

function getVoteMajority(game) {
  let best = null;
  let bestCount = 0;
  let tied = false;
  for (const [idx, voters] of Object.entries(game.votes)) {
    if (voters.length > bestCount) {
      best = parseInt(idx, 10);
      bestCount = voters.length;
      tied = false;
    } else if (voters.length === bestCount) {
      tied = true;
    }
  }
  if (tied || bestCount === 0) return null;
  return best;
}

function clearVotes(game) {
  game.votes = {};
}

function processGuess(game, cardIndex, team) {
  if (game.winner) return { error: 'Game is over' };
  if (game.phase !== 'operative') return { error: 'Not guessing phase' };
  if (game.currentTeam !== team) return { error: 'Not your turn' };

  const card = game.cards[cardIndex];
  if (!card) return { error: 'Invalid card' };
  if (card.revealed) return { error: 'Already revealed' };

  clearVotes(game);
  card.revealed = true;

  if (card.type === 'red') game.redRemaining--;
  if (card.type === 'blue') game.blueRemaining--;

  const entry = { team, cardIndex, cardType: card.type };
  game.log.push(entry);

  if (card.type === CARD_TYPES.ASSASSIN) {
    game.winner = team === 'red' ? 'blue' : 'red';
    game.phase = 'gameover';
    return { result: 'assassin', winner: game.winner };
  }

  if (game.redRemaining === 0) {
    game.winner = 'red';
    game.phase = 'gameover';
    return { result: 'win', winner: 'red' };
  }
  if (game.blueRemaining === 0) {
    game.winner = 'blue';
    game.phase = 'gameover';
    return { result: 'win', winner: 'blue' };
  }

  if (card.type !== team) {
    switchTurn(game);
    return { result: 'wrong', switchedTo: game.currentTeam };
  }

  game.guessesRemaining--;
  if (game.guessesRemaining === 0) {
    switchTurn(game);
    return { result: 'out_of_guesses', switchedTo: game.currentTeam };
  }

  return { result: 'correct' };
}

function submitClue(game, team, word, count) {
  if (game.winner) return { error: 'Game is over' };
  if (game.phase !== 'spymaster') return { error: 'Not clue phase' };
  if (game.currentTeam !== team) return { error: 'Not your turn' };
  if (!word || typeof word !== 'string') return { error: 'Invalid clue word' };
  if (typeof count !== 'number' || count < 0 || count > game.config.total) return { error: 'Invalid count' };

  const clueWord = word.trim().toUpperCase();
  if (clueWord.length === 0) return { error: 'Empty clue' };

  game.currentClue = { word: clueWord, count };
  game.guessesRemaining = count + 1;
  game.phase = 'operative';
  clearVotes(game);
  game.log.push({ team, clue: clueWord, count });

  return { result: 'ok' };
}

function endTurn(game, team) {
  if (game.winner) return { error: 'Game is over' };
  if (game.phase !== 'operative') return { error: 'Not guessing phase' };
  if (game.currentTeam !== team) return { error: 'Not your turn' };
  switchTurn(game);
  return { result: 'ok', switchedTo: game.currentTeam };
}

function switchTurn(game) {
  game.currentTeam = game.currentTeam === 'red' ? 'blue' : 'red';
  game.phase = 'spymaster';
  game.currentClue = null;
  game.guessesRemaining = 0;
  clearVotes(game);
}

function getPlayerView(game, role) {
  return {
    mode: game.mode,
    config: game.config,
    cards: game.cards.map((c) => ({
      id: c.id,
      content: c.content,
      revealed: c.revealed,
      type: role === 'spymaster' || c.revealed ? c.type : null,
      typeVariant: c.revealed ? c.typeVariant : null,
    })),
    startingTeam: game.startingTeam,
    currentTeam: game.currentTeam,
    phase: game.phase,
    currentClue: game.currentClue,
    guessesRemaining: game.guessesRemaining,
    redRemaining: game.redRemaining,
    blueRemaining: game.blueRemaining,
    winner: game.winner,
    log: game.log,
    votes: game.phase === 'operative' ? game.votes : {},
  };
}

module.exports = { createGame, processGuess, submitClue, endTurn, getPlayerView, castVote, getVoteMajority, clearVotes };
