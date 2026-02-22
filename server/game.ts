import { randomInt } from 'node:crypto';
import type {
  BoardConfig,
  Card,
  CardType,
  Team,
  GameState,
  GameMode,
  ErrorResult,
  GuessResult,
  OkResult,
  Phase,
  Role,
} from './types';
import { CARD_TYPES } from './types';

const PICTURES_CONFIG: BoardConfig = {
  rows: 4,
  cols: 5,
  total: 20,
  starting: 8,
  other: 7,
  bystanders: 4,
  assassins: 1,
};
const WORDS_CONFIG: BoardConfig = { rows: 5, cols: 5, total: 25, starting: 9, other: 8, bystanders: 7, assassins: 1 };

const VARIANT_COUNTS: Record<CardType, number> = {
  red: 5,
  blue: 5,
  bystander: 5,
  assassin: 2,
};

function cryptoShuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function generateKeyCard(config: BoardConfig, startingTeam: Team): CardType[] {
  const other: Team = startingTeam === 'red' ? 'blue' : 'red';
  const types: CardType[] = [
    ...Array<CardType>(config.starting).fill(startingTeam),
    ...Array<CardType>(config.other).fill(other),
    ...Array<CardType>(config.bystanders).fill(CARD_TYPES.BYSTANDER),
    ...Array<CardType>(config.assassins).fill(CARD_TYPES.ASSASSIN),
  ];
  return cryptoShuffle(types);
}

function getImagePool(): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= 24; i++) {
    ids.push(`card_${String(i).padStart(2, '0')}`);
  }
  return ids;
}

export function createGame(mode: GameMode, wordPool: string[]): GameState {
  const config = mode === 'pictures' ? PICTURES_CONFIG : WORDS_CONFIG;
  const startingTeam: Team = randomInt(0, 2) === 0 ? 'red' : 'blue';
  const keyCard = generateKeyCard(config, startingTeam);

  let cardContents: string[];
  if (mode === 'pictures') {
    cardContents = cryptoShuffle(getImagePool()).slice(0, config.total);
  } else {
    cardContents = cryptoShuffle(wordPool).slice(0, config.total);
  }

  const cards: Card[] = cardContents.map((content, i) => ({
    id: i,
    content,
    type: keyCard[i]!,
    revealed: false,
    typeVariant: randomInt(1, VARIANT_COUNTS[keyCard[i]!] + 1),
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
    turnDeadline: null,
  };
}

export function castVote(game: GameState, cardIndex: number, playerId: string): ErrorResult | OkResult {
  if (game.winner) return { error: 'Game is over' };
  if (game.phase !== 'operative') return { error: 'Not guessing phase' };
  const card = game.cards[cardIndex];
  if (!card) return { error: 'Invalid card' };
  if (card.revealed) return { error: 'Already revealed' };

  for (const idx of Object.keys(game.votes)) {
    game.votes[idx] = game.votes[idx]!.filter((id) => id !== playerId);
    if (game.votes[idx]!.length === 0) delete game.votes[idx];
  }
  if (!game.votes[cardIndex]) game.votes[cardIndex] = [];
  game.votes[cardIndex]!.push(playerId);
  return { result: 'ok' };
}

export function getVoteMajority(game: GameState): number | null {
  let best: number | null = null;
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

export function clearVotes(game: GameState): void {
  game.votes = {};
}

export function setDeadline(game: GameState, timeoutMs: number): void {
  game.turnDeadline = timeoutMs > 0 ? Date.now() + timeoutMs : null;
}

export function switchTurn(game: GameState): void {
  game.currentTeam = game.currentTeam === 'red' ? 'blue' : 'red';
  game.phase = 'spymaster';
  game.currentClue = null;
  game.guessesRemaining = 0;
  clearVotes(game);
}

export function processGuess(game: GameState, cardIndex: number, team: Team): ErrorResult | GuessResult {
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

  game.log.push({ team, cardIndex, cardType: card.type });

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

export function submitClue(game: GameState, team: Team, word: string, count: number): ErrorResult | OkResult {
  if (game.winner) return { error: 'Game is over' };
  if (game.phase !== 'spymaster') return { error: 'Not clue phase' };
  if (game.currentTeam !== team) return { error: 'Not your turn' };
  if (!word || typeof word !== 'string') return { error: 'Invalid clue word' };
  if (!Number.isInteger(count) || count < 0 || count > game.config.total) {
    return { error: 'Invalid count' };
  }

  const clueWord = word.trim().toUpperCase();
  if (clueWord.length === 0) return { error: 'Empty clue' };

  if (game.mode !== 'pictures') {
    for (const card of game.cards) {
      const cw = card.content.toUpperCase();
      if (clueWord.includes(cw) || cw.includes(clueWord)) {
        return { error: `Clue must not contain or match board word "${cw}"` };
      }
    }
  }

  game.currentClue = { word: clueWord, count };
  game.guessesRemaining = count + 1;
  game.phase = 'operative';
  clearVotes(game);
  game.log.push({ team, clue: clueWord, count });

  return { result: 'ok' };
}

export function endTurn(game: GameState, team: Team): ErrorResult | OkResult {
  if (game.winner) return { error: 'Game is over' };
  if (game.phase !== 'operative') return { error: 'Not guessing phase' };
  if (game.currentTeam !== team) return { error: 'Not your turn' };
  switchTurn(game);
  return { result: 'ok', switchedTo: game.currentTeam };
}

export function getPlayerView(game: GameState, role: Role) {
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
    turnDeadline: game.turnDeadline,
  };
}
