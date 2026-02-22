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
export type CategoryId =
  | 'observability'
  | 'buzzwords'
  | 'influencers'
  | 'programming'
  | 'startups'
  | 'popculture'
  | 'music'
  | 'geography'
  | 'currentaffairs'
  | 'gilmoregirls'
  | 'strangerthings'
  | 'gaming'
  | 'movies'
  | 'australia'
  | 'friends'
  | 'seinfeld'
  | 'custom';

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

// --- Client view types (payloads sent from server to client) ---

export interface CardView {
  readonly id: number;
  readonly content: string;
  readonly revealed: boolean;
  readonly type: CardType | null;
  readonly typeVariant: number | null;
}

export interface DuetCardView {
  readonly id: number;
  readonly content: string;
  readonly revealed: boolean;
  readonly typeA?: DuetCardType;
  readonly typeB?: DuetCardType;
  readonly myType?: DuetCardType | null;
  readonly revealedType: DuetCardType | null;
}

export interface PlayerView {
  readonly id: string;
  readonly name: string;
  readonly team: Team | null;
  readonly role: Role;
  readonly avatarId: number;
  readonly isHost?: boolean;
}

export interface YouPayload {
  readonly id: string;
  readonly name: string;
  readonly team: Team | null;
  readonly role: Role;
  readonly isHost: boolean;
  readonly isSolo: boolean;
  readonly avatarId: number;
  readonly duetSide?: DuetSide | null;
}

export interface ClassicGameView {
  readonly mode: 'words' | 'pictures';
  readonly config: BoardConfig;
  readonly cards: CardView[];
  readonly startingTeam: Team;
  readonly currentTeam: Team;
  readonly phase: Phase;
  readonly currentClue: Clue | null;
  readonly guessesRemaining: number;
  readonly redRemaining: number;
  readonly blueRemaining: number;
  readonly winner: Team | null;
  readonly log: LogEntry[];
  readonly votes: Record<string, string[]>;
  readonly turnDeadline: number | null;
  readonly roomCode: string;
  readonly chatLog: ChatMessage[];
  readonly playerAvatars: Record<string, number>;
  readonly players: PlayerView[];
  readonly you: YouPayload;
}

export interface DuetGameView {
  readonly mode: 'duet';
  readonly config: BoardConfig;
  readonly cards: DuetCardView[];
  readonly currentTurn: DuetSide;
  readonly phase: Phase;
  readonly currentClue: Clue | null;
  readonly guessesRemaining: number;
  readonly turnsRemaining: number;
  readonly greenFound: number;
  readonly greenTotal: number;
  readonly winner: 'win' | 'lose' | null;
  readonly log: DuetLogEntry[];
  readonly turnDeadline: number | null;
  readonly roomCode: string;
  readonly chatLog: ChatMessage[];
  readonly playerAvatars: Record<string, number>;
  readonly players: PlayerView[];
  readonly you: YouPayload;
}

export type GameViewPayload = ClassicGameView | DuetGameView;

export interface CategoryInfo {
  readonly id: CategoryId;
  readonly label: string;
}

export interface LobbyState {
  readonly code: string;
  readonly gameType: GameType;
  readonly mode: GameMode;
  readonly categoryId: CategoryId;
  readonly difficulty: Difficulty;
  readonly turnTimeout: TurnTimeout;
  readonly categories: CategoryInfo[];
  readonly playerA: string | null;
  readonly playerB: string | null;
  readonly players: (PlayerView & { readonly isHost: boolean })[];
  readonly hostId: string | null;
  readonly inGame: boolean;
}

export interface WordlistStatus {
  readonly status: 'default' | 'custom' | 'error';
  readonly count?: number;
  readonly message?: string;
}
