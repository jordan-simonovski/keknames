import { randomInt } from 'node:crypto';
import type {
  BoardConfig,
  DuetCardType,
  DuetKeyCard,
  DuetCard,
  DuetState,
  DuetSide,
  Clue,
  ErrorResult,
  DuetGuessResult,
  OkResult,
  DuetLogEntry,
} from './types';

const DUET_CONFIG: BoardConfig = {
  rows: 5,
  cols: 5,
  total: 25,
  starting: 9,
  other: 9,
  bystanders: 13,
  assassins: 3,
};

const DUET_GREEN_TOTAL = 15;
const DUET_INITIAL_TOKENS = 9;

// Official Duet key card distribution: 25 [sideA, sideB] pairs.
// Side A: 9 green, 3 assassin, 13 neutral
// Side B: 9 green, 3 assassin, 13 neutral
// Unique greens across both sides: 15
const KEY_CARD_TEMPLATE: readonly [DuetCardType, DuetCardType][] = [
  ...fill('green', 'green', 3),
  ...fill('green', 'neutral', 5),
  ...fill('green', 'assassin', 1),
  ...fill('neutral', 'green', 5),
  ...fill('assassin', 'green', 1),
  ...fill('neutral', 'neutral', 7),
  ...fill('assassin', 'neutral', 1),
  ...fill('neutral', 'assassin', 1),
  ...fill('assassin', 'assassin', 1),
];

function fill(a: DuetCardType, b: DuetCardType, n: number): [DuetCardType, DuetCardType][] {
  return Array.from({ length: n }, () => [a, b]);
}

function cryptoShuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function generateDuetKeyCard(): DuetKeyCard {
  const shuffled = cryptoShuffle(KEY_CARD_TEMPLATE);
  const sideA: DuetCardType[] = [];
  const sideB: DuetCardType[] = [];
  for (const [a, b] of shuffled) {
    sideA.push(a);
    sideB.push(b);
  }
  return { sideA, sideB };
}

export function createDuetGame(wordPool: string[]): DuetState {
  const config = DUET_CONFIG;
  const keyCard = generateDuetKeyCard();
  const contents = cryptoShuffle(wordPool).slice(0, config.total);

  const cards: DuetCard[] = contents.map((content, i) => ({
    id: i,
    content,
    typeA: keyCard.sideA[i]!,
    typeB: keyCard.sideB[i]!,
    revealed: false,
    revealedType: null,
  }));

  return {
    mode: 'duet',
    config,
    cards,
    duetKey: keyCard,
    currentTurn: randomInt(0, 2) === 0 ? 'A' : 'B',
    phase: 'spymaster',
    currentClue: null,
    guessesRemaining: 0,
    turnsRemaining: DUET_INITIAL_TOKENS,
    greenFound: 0,
    greenTotal: DUET_GREEN_TOTAL,
    winner: null,
    log: [],
    turnDeadline: null,
  };
}

export function setDuetDeadline(state: DuetState, timeoutMs: number): void {
  state.turnDeadline = timeoutMs > 0 ? Date.now() + timeoutMs : null;
}

function guesserSide(state: DuetState): DuetSide {
  return state.currentTurn === 'A' ? 'B' : 'A';
}

function cardTypeForSide(card: DuetCard, side: DuetSide): DuetCardType {
  return side === 'A' ? card.typeA : card.typeB;
}

function countAllGreens(cards: DuetCard[]): number {
  let count = 0;
  for (const c of cards) {
    if (c.revealed && (c.typeA === 'green' || c.typeB === 'green')) count++;
  }
  return count;
}

function switchDuetTurn(state: DuetState): void {
  state.currentTurn = state.currentTurn === 'A' ? 'B' : 'A';
  state.phase = 'spymaster';
  state.currentClue = null;
  state.guessesRemaining = 0;
}

export function submitDuetClue(state: DuetState, word: string, count: number): ErrorResult | OkResult {
  if (state.winner) return { error: 'Game is over' };
  if (state.phase !== 'spymaster') return { error: 'Not clue phase' };
  if (!word || typeof word !== 'string') return { error: 'Invalid clue word' };
  if (!Number.isInteger(count) || count < 0 || count > state.config.total) {
    return { error: 'Invalid count' };
  }

  const clueWord = word.trim().toUpperCase();
  if (clueWord.length === 0) return { error: 'Empty clue' };

  for (const card of state.cards) {
    const cw = card.content.toUpperCase();
    if (clueWord.includes(cw) || cw.includes(clueWord)) {
      return { error: `Clue must not contain or match board word "${cw}"` };
    }
  }

  state.currentClue = { word: clueWord, count };
  state.guessesRemaining = count === 0 ? 99 : count + 1;
  state.phase = 'operative';
  state.log.push({ side: state.currentTurn, clue: clueWord, count });

  return { result: 'ok' };
}

export function processDuetGuess(state: DuetState, cardIndex: number): ErrorResult | DuetGuessResult {
  if (state.winner) return { error: 'Game is over' };
  if (state.phase !== 'operative') return { error: 'Not guessing phase' };

  const card = state.cards[cardIndex];
  if (!card) return { error: 'Invalid card' };
  if (card.revealed) return { error: 'Already revealed' };

  const side = guesserSide(state);
  const type = cardTypeForSide(card, side);

  card.revealed = true;
  card.revealedType = type;
  state.log.push({ side, cardIndex, cardType: type });

  if (type === 'assassin') {
    state.winner = 'lose';
    state.phase = 'gameover';
    return { result: 'assassin', winner: 'lose' };
  }

  state.greenFound = countAllGreens(state.cards);

  if (state.greenFound >= state.greenTotal) {
    state.winner = 'win';
    state.phase = 'gameover';
    return { result: 'win', winner: 'win' };
  }

  if (type === 'neutral') {
    state.turnsRemaining--;
    if (state.turnsRemaining <= 0) {
      state.winner = 'lose';
      state.phase = 'gameover';
      return { result: 'tokens_exhausted', winner: 'lose' };
    }
    switchDuetTurn(state);
    return { result: 'neutral' };
  }

  // Green -- keep guessing
  state.guessesRemaining--;
  if (state.guessesRemaining <= 0) {
    state.turnsRemaining--;
    if (state.turnsRemaining <= 0) {
      state.winner = 'lose';
      state.phase = 'gameover';
      return { result: 'tokens_exhausted', winner: 'lose' };
    }
    switchDuetTurn(state);
    return { result: 'correct' };
  }

  return { result: 'correct' };
}

export function endDuetTurn(state: DuetState): ErrorResult | OkResult {
  if (state.winner) return { error: 'Game is over' };
  if (state.phase !== 'operative') return { error: 'Not guessing phase' };
  state.turnsRemaining--;
  if (state.turnsRemaining <= 0) {
    state.winner = 'lose';
    state.phase = 'gameover';
    return { result: 'ok' };
  }
  switchDuetTurn(state);
  return { result: 'ok' };
}

export function skipDuetTurn(state: DuetState): void {
  if (state.winner || state.phase === 'gameover') return;
  if (state.phase === 'spymaster') {
    state.turnsRemaining--;
    if (state.turnsRemaining <= 0) {
      state.winner = 'lose';
      state.phase = 'gameover';
      return;
    }
    switchDuetTurn(state);
  } else {
    state.turnsRemaining--;
    if (state.turnsRemaining <= 0) {
      state.winner = 'lose';
      state.phase = 'gameover';
      return;
    }
    switchDuetTurn(state);
  }
}

export function getDuetPlayerView(state: DuetState, side: DuetSide | null) {
  return {
    mode: state.mode,
    config: state.config,
    cards: state.cards.map((c) => {
      if (c.revealed) {
        return {
          id: c.id,
          content: c.content,
          revealed: true,
          typeA: c.typeA,
          typeB: c.typeB,
          revealedType: c.revealedType,
        };
      }
      return {
        id: c.id,
        content: c.content,
        revealed: false,
        myType: side ? cardTypeForSide(c, side) : null,
        revealedType: null,
      };
    }),
    currentTurn: state.currentTurn,
    phase: state.phase,
    currentClue: state.currentClue,
    guessesRemaining: state.guessesRemaining,
    turnsRemaining: state.turnsRemaining,
    greenFound: state.greenFound,
    greenTotal: state.greenTotal,
    winner: state.winner,
    log: state.log,
    turnDeadline: state.turnDeadline,
  };
}
