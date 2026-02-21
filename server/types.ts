import { z } from 'zod';

// --- Card & Board ---

export const CARD_TYPES = {
  RED: 'red',
  BLUE: 'blue',
  BYSTANDER: 'bystander',
  ASSASSIN: 'assassin',
} as const;

export type CardType = (typeof CARD_TYPES)[keyof typeof CARD_TYPES];
export type Team = 'red' | 'blue';
export type Role = 'spymaster' | 'operative' | 'spectator';
export type TurnTimeout = 0 | 60 | 120 | 180 | 300;
export type Phase = 'spymaster' | 'operative' | 'gameover';
export type GameMode = 'words' | 'pictures' | 'duet';
export type GameType = 'classic' | 'duet';
export type DuetCardType = 'green' | 'assassin' | 'neutral';
export type DuetSide = 'A' | 'B';
export type Difficulty = 'easy' | 'hard';
export type CategoryId = 'observability' | 'buzzwords' | 'influencers' | 'programming' | 'startups' | 'popculture' | 'music' | 'geography' | 'currentaffairs' | 'gilmoregirls' | 'strangerthings' | 'gaming' | 'movies' | 'australia' | 'friends' | 'seinfeld' | 'custom';

export interface BoardConfig {
  readonly rows: number;
  readonly cols: number;
  readonly total: number;
  readonly starting: number;
  readonly other: number;
  readonly bystanders: number;
  readonly assassins: number;
}

export interface Card {
  readonly id: number;
  readonly content: string;
  readonly type: CardType;
  revealed: boolean;
  readonly typeVariant: number;
}

export interface Clue {
  readonly word: string;
  readonly count: number;
}

export interface GuessLogEntry {
  readonly team: Team;
  readonly cardIndex: number;
  readonly cardType: CardType;
}

export interface ClueLogEntry {
  readonly team: Team;
  readonly clue: string;
  readonly count: number;
}

export type LogEntry = GuessLogEntry | ClueLogEntry;

export interface DuetGuessLogEntry {
  readonly side: DuetSide;
  readonly cardIndex: number;
  readonly cardType: DuetCardType;
}

export interface DuetClueLogEntry {
  readonly side: DuetSide;
  readonly clue: string;
  readonly count: number;
}

export type DuetLogEntry = DuetGuessLogEntry | DuetClueLogEntry;

export interface GameState {
  readonly mode: GameMode;
  readonly config: BoardConfig;
  cards: Card[];
  readonly startingTeam: Team;
  currentTeam: Team;
  phase: Phase;
  currentClue: Clue | null;
  guessesRemaining: number;
  redRemaining: number;
  blueRemaining: number;
  winner: Team | null;
  log: LogEntry[];
  votes: Record<string, string[]>;
  turnDeadline: number | null;
}

// --- Duet Mode ---

export interface DuetKeyCard {
  readonly sideA: DuetCardType[];
  readonly sideB: DuetCardType[];
}

export interface DuetCard {
  readonly id: number;
  readonly content: string;
  readonly typeA: DuetCardType;
  readonly typeB: DuetCardType;
  revealed: boolean;
  revealedType: DuetCardType | null;
}

export interface DuetState {
  readonly mode: 'duet';
  readonly config: BoardConfig;
  cards: DuetCard[];
  duetKey: DuetKeyCard;
  currentTurn: DuetSide;
  phase: Phase;
  currentClue: Clue | null;
  guessesRemaining: number;
  turnsRemaining: number;
  greenFound: number;
  greenTotal: number;
  winner: 'win' | 'lose' | null;
  log: DuetLogEntry[];
  turnDeadline: number | null;
}

// --- Players & Rooms ---

export interface Player {
  readonly id: string;
  socketId: string;
  name: string;
  team: Team | null;
  role: Role;
  readonly avatarId: number;
}

export interface ChatMessage {
  readonly id: string;
  readonly name: string;
  readonly team: Team | null;
  readonly text: string;
  readonly ts: number;
}

export interface Room {
  readonly code: string;
  host: string | null;
  players: Player[];
  gameType: GameType;
  mode: GameMode;
  categoryId: CategoryId;
  difficulty: Difficulty;
  customWords: string[] | null;
  turnTimeout: TurnTimeout;
  game: GameState | DuetState | null;
  playerA: string | null;
  playerB: string | null;
  chatLog: ChatMessage[];
}

// --- Operation results ---

export interface ErrorResult {
  readonly error: string;
}

export interface GuessResult {
  readonly result: 'assassin' | 'win' | 'wrong' | 'out_of_guesses' | 'correct';
  readonly winner?: Team;
  readonly switchedTo?: Team;
}

export interface DuetGuessResult {
  readonly result: 'assassin' | 'win' | 'neutral' | 'correct' | 'tokens_exhausted';
  readonly winner?: 'win' | 'lose';
}

export interface OkResult {
  readonly result: 'ok';
  readonly switchedTo?: Team;
}

export type GameResult = ErrorResult | GuessResult | OkResult;

// --- Zod schemas for socket event payloads ---

function stripHtml(s: string): string {
  return s.replace(/[<>"'`]/g, '');
}

const sanitizedString = (maxLen: number) =>
  z.string().trim().transform(stripHtml).pipe(z.string().min(1).max(maxLen));

export const CreateRoomSchema = z.object({
  name: sanitizedString(20),
});

export const JoinRoomSchema = z.object({
  code: sanitizedString(10),
  name: sanitizedString(20),
});

export const AssignTeamSchema = z.object({
  targetId: z.string().min(1).max(100),
  team: z.enum(['red', 'blue']).nullable().optional(),
  role: z.enum(['spymaster', 'operative', 'spectator']).optional(),
});

export const SetModeSchema = z.object({
  mode: z.enum(['pictures', 'words']),
});

export const SetCategorySchema = z.object({
  categoryId: z.enum(['observability', 'buzzwords', 'influencers', 'programming', 'startups', 'popculture', 'music', 'geography', 'currentaffairs', 'gilmoregirls', 'strangerthings', 'gaming', 'movies', 'australia', 'friends', 'seinfeld', 'custom']),
  difficulty: z.enum(['easy', 'hard']),
});

export const SetWordlistSchema = z.object({
  words: z.array(z.string().transform(stripHtml).pipe(z.string().max(30))).max(500).nullable(),
});

export const GiveClueSchema = z.object({
  word: sanitizedString(50),
  count: z.number().int().min(0).max(25),
});

export const CardIndexSchema = z.object({
  cardIndex: z.number().int().min(0).max(24),
});

export const SetGameTypeSchema = z.object({
  gameType: z.enum(['classic', 'duet']),
});

export const SetTimeoutSchema = z.object({
  seconds: z.union([z.literal(0), z.literal(60), z.literal(120), z.literal(180), z.literal(300)]),
});

export const SendChatSchema = z.object({
  text: sanitizedString(200),
});
