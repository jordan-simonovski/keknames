import type { CategoryId, Difficulty } from './types';

export interface WordCategory {
  readonly id: CategoryId;
  readonly label: string;
  readonly easy: readonly string[];
  readonly hard: readonly string[];
}

// ---------- Observability ----------

const OBSERVABILITY_EASY = dedupe([
  'METRIC', 'LOG', 'ALERT', 'DASHBOARD', 'LATENCY',
  'ERROR', 'TIMEOUT', 'UPTIME', 'DOWNTIME', 'DEPLOY',
  'CACHE', 'REDIS', 'KAFKA', 'CONTAINER', 'ENDPOINT',
  'STATUS', 'INCIDENT', 'ROLLBACK', 'FEATURE', 'FLAG',
  'RETRY', 'QUEUE', 'BUFFER', 'CLUSTER', 'NODE',
  'DNS', 'LOAD', 'PROXY', 'SERVICE', 'WEBHOOK',
  'EVENT', 'SCHEMA', 'PROFILE', 'SOCKET', 'CONNECTION',
  'POOL', 'TOKEN', 'SECRET', 'POD', 'PIPELINE',
]);

const OBSERVABILITY_HARD = dedupe([
  'TRACE', 'SPAN', 'CARDINALITY', 'SAMPLING', 'INGESTION',
  'PROMETHEUS', 'JAEGER', 'ZIPKIN', 'TEMPO', 'LOKI',
  'MIMIR', 'CORTEX', 'THANOS', 'PERCENTILE', 'HISTOGRAM',
  'GAUGE', 'RUNBOOK', 'POSTMORTEM', 'ESCALATION', 'ONCALL',
  'SIDECAR', 'INGRESS', 'EGRESS', 'BAGGAGE', 'PROPAGATION',
  'CORRELATION', 'ANOMALY', 'BASELINE', 'DRIFT', 'EBPF',
  'OTEL', 'COLLECTOR', 'EXPORTER', 'FEDERATION', 'DOWNSAMPLE',
  'SEMAPHORE', 'GOROUTINE', 'MUTEX', 'REMEDIATION', 'CANARY',
]);

// ---------- Tech Buzzwords 2026 ----------

const BUZZWORDS_EASY = dedupe([
  'PROMPT', 'CHATBOT', 'COPILOT', 'DEEPFAKE', 'CRYPTO',
  'BLOCKCHAIN', 'METAVERSE', 'CLOUD', 'SERVERLESS', 'AGILE',
  'SCRUM', 'SPRINT', 'KUBERNETES', 'DOCKER', 'DEVOPS',
  'FULLSTACK', 'DISRUPT', 'UNICORN', 'PIVOT', 'BANDWIDTH',
  'SYNERGY', 'LEVERAGE', 'STARTUP', 'BURNOUT', 'STANDUP',
  'BACKLOG', 'HASHTAG', 'INFLUENCER', 'ALGORITHM', 'VIRAL',
  'CLICKBAIT', 'PAYWALL', 'CROWDFUND', 'GAMIFY', 'ECOSYSTEM',
  'PLATFORM', 'MONETIZE', 'OPTIMIZE', 'AUTOMATE', 'ITERATE',
]);

const BUZZWORDS_HARD = dedupe([
  'HALLUCINATE', 'FINETUNE', 'EMBEDDING', 'QUANTIZE', 'INFERENCE',
  'DIFFUSION', 'TRANSFORMER', 'AGENTIC', 'GROUNDING', 'ALIGNMENT',
  'GUARDRAIL', 'MULTIMODAL', 'TOKENIZER', 'OVERFITTING', 'PERPLEXITY',
  'LORA', 'EMERGENT', 'SHOGGOTH', 'SYCOPHANCY', 'STOCHASTIC',
  'SLOP', 'ENSHITTIFY', 'RUGPULL', 'DOOMSCROLL', 'VAPORWARE',
  'BIKESHED', 'FOOTGUN', 'YAGNI', 'WEBSCALE', 'TECHDEBT',
  'MONOREPO', 'BLAZINGLY', 'RUSTACEAN', 'BOILERPLATE', 'NIXPILL',
  'LOBOTOMIZE', 'VIBECHECK', 'BESPOKE', 'PARADIGM', 'SYNERGIZE',
]);

// ---------- Tech Influencers ----------

const INFLUENCERS_EASY = dedupe([
  'TORVALDS', 'MUSK', 'ZUCKERBERG', 'BEZOS', 'GATES',
  'WOZNIAK', 'TURING', 'ALTMAN', 'CARMACK', 'KNUTH',
  'LOVELACE', 'HOPPER', 'DIJKSTRA', 'STALLMAN', 'PICHAI',
  'COOK', 'DORSEY', 'SWEENEY', 'NOTCH', 'KARPATHY',
  'HINTON', 'RITCHIE', 'THOMPSON', 'HAMILTON', 'BABBAGE',
  'GOSLING', 'NADELLA', 'PRIMEAGEN', 'FIRESHIP', 'LEVELSIO',
]);

const INFLUENCERS_HARD = dedupe([
  'MCCARTHY', 'BACKUS', 'HOARE', 'LAMPORT', 'TANENBAUM',
  'CONWAY', 'CHURCH', 'LISKOV', 'CODD', 'SHANNON',
  'HUFFMAN', 'RIVEST', 'DIFFIE', 'BERNSTEIN', 'SCHNEIER',
  'MITNICK', 'MATSUMOTO', 'HEJLSBERG', 'LATTNER', 'HOTZ',
  'WOLFRAM', 'ENGELBART', 'POSTEL', 'KERNIGHAN', 'PIKE',
  'SANDERSON', 'GWERN', 'SUTSKEVER', 'LECUN', 'BENGIO',
]);

// ---------- Programming ----------

const PROGRAMMING_EASY = dedupe([
  'PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'JAVA', 'RUST',
  'GOLANG', 'RUBY', 'SWIFT', 'KOTLIN', 'REACT',
  'ANGULAR', 'VUE', 'NODE', 'WEBPACK', 'GIT',
  'LINUX', 'DOCKER', 'DATABASE', 'FRONTEND', 'BACKEND',
  'API', 'FUNCTION', 'VARIABLE', 'ARRAY', 'OBJECT',
  'BOOLEAN', 'STRING', 'INTEGER', 'LOOP', 'DEBUG',
  'COMPILE', 'TEST', 'MERGE', 'BRANCH', 'COMMIT',
  'FRAMEWORK', 'LIBRARY', 'PACKAGE', 'MODULE', 'IMPORT',
]);

const PROGRAMMING_HARD = dedupe([
  'MONAD', 'FUNCTOR', 'THUNK', 'CLOSURE', 'COROUTINE',
  'SEMAPHORE', 'MUTEX', 'DEADLOCK', 'LAMBDA', 'CURRYING',
  'POLYMORPHISM', 'COVARIANCE', 'EIGENCLASS', 'METACLASS', 'HOMOICONIC',
  'LISP', 'HASKELL', 'ERLANG', 'PROLOG', 'FORTH',
  'BRAINFUCK', 'COBOL', 'FORTRAN', 'REENTRANT', 'IDEMPOTENT',
  'ENDIANNESS', 'MEMOIZE', 'SEGFAULT', 'HEISENBUG', 'THRASHING',
  'TOMBSTONE', 'QUINE', 'HALTING', 'COMBINATOR', 'TYPECLASS',
  'CONTRAVARIANT', 'BIJECTIVE', 'Church', 'FIXPOINT', 'TRAMPOLINING',
]);

// ---------- Startup Lingo ----------

const STARTUPS_EASY = dedupe([
  'PIVOT', 'UNICORN', 'DISRUPT', 'SCALE', 'RUNWAY',
  'VALUATION', 'EQUITY', 'VESTING', 'SEED', 'EXIT',
  'IPO', 'BURN', 'REVENUE', 'GROWTH', 'CHURN',
  'RETENTION', 'ONBOARD', 'FREEMIUM', 'SAAS', 'PITCH',
  'DECK', 'FOUNDER', 'ANGEL', 'VENTURE', 'BOOTSTRAP',
  'ACCELERATOR', 'INCUBATOR', 'ACQUISITION', 'DILUTION', 'SERIES',
  'TRACTION', 'MARKET', 'PRODUCT', 'ROADMAP', 'MOCKUP',
  'PROTOTYPE', 'BETA', 'LAUNCH', 'ITERATE', 'FEEDBACK',
]);

const STARTUPS_HARD = dedupe([
  'LIQUIDATION', 'PREFERENCE', 'RATCHET', 'ANTIDILUTION', 'CLAWBACK',
  'PRORATA', 'WATERFALL', 'DRAGALONG', 'TAGALONG', 'CONVERTIBLE',
  'SAFE', 'SECONDARIES', 'DOWNROUND', 'BLITZSCALE', 'FLYWHEEL',
  'MOAT', 'TAM', 'SAM', 'SOM', 'COHORT',
  'LTV', 'CAC', 'ARPU', 'MRR', 'ARR',
  'PMF', 'GTM', 'PLG', 'MARKUP', 'EARNOUT',
  'CLIFFVEST', 'CAPEX', 'OPEX', 'MEZZ', 'BRIDGE',
  'TERMSHEET', 'DUEDILIGENCE', 'FIDUCIARY', 'SYNDICATE', 'SPV',
]);

// ---------- Pop Culture ----------

const POPCULTURE_EASY = dedupe([
  'MARVEL', 'BATMAN', 'STARWARS', 'NETFLIX', 'TIKTOK',
  'MEME', 'EMOJI', 'SELFIE', 'BINGE', 'SEQUEL',
  'REBOOT', 'COSPLAY', 'FANDOM', 'ANIME', 'MANGA',
  'PODCAST', 'STREAMER', 'CELEBRITY', 'PAPARAZZI', 'TABLOID',
  'OSCAR', 'GRAMMY', 'EMMY', 'BLOCKBUSTER', 'FRANCHISE',
  'SPINOFF', 'CAMEO', 'TRAILER', 'SPOILER', 'CLIFFHANGER',
  'MINISERIES', 'REMAKE', 'TRENDING', 'CANCEL', 'STAN',
  'FANGIRL', 'SHIP', 'CANON', 'RETCON', 'CROSSOVER',
]);

const POPCULTURE_HARD = dedupe([
  'ZEITGEIST', 'ZEITGEBER', 'SIMULACRUM', 'PASTICHE', 'KITSCH',
  'CAMP', 'IRONY', 'SATIRE', 'PARODY', 'TROPE',
  'MACGUFFIN', 'KAIJU', 'ISEKAI', 'TOKUSATSU', 'WEBTOON',
  'MANHWA', 'OTAKU', 'GACHA', 'PARASOCIAL', 'DEINFLUENCE',
  'NEPO', 'COTTAGECORE', 'LIMINALSPACE', 'CREEPYPASTA', 'ARG',
  'TULPA', 'RETROWAVE', 'VAPORWAVE', 'HYPERPOP', 'MUMBLECORE',
  'BILDUNGSROMAN', 'AUTOFICTION', 'GONZO', 'BRICOLAGE', 'FLANEUR',
  'SUBLIME', 'UNCANNY', 'GROTESQUE', 'ABSURDIST', 'SURREAL',
]);

// ---------- Music ----------

const MUSIC_EASY = dedupe([
  'GUITAR', 'PIANO', 'DRUMS', 'BASS', 'SINGER',
  'CHORUS', 'LYRIC', 'ALBUM', 'SINGLE', 'CONCERT',
  'FESTIVAL', 'ENCORE', 'REMIX', 'VINYL', 'PLAYLIST',
  'SPOTIFY', 'RADIO', 'KARAOKE', 'DUET', 'SOLO',
  'BAND', 'GENRE', 'HIPHOP', 'JAZZ', 'BLUES',
  'ROCK', 'PUNK', 'POP', 'COUNTRY', 'REGGAE',
  'MELODY', 'RHYTHM', 'TEMPO', 'BRIDGE', 'HOOK',
  'BALLAD', 'ANTHEM', 'COVER', 'ACOUSTIC', 'ELECTRIC',
]);

const MUSIC_HARD = dedupe([
  'SYNCOPATION', 'ARPEGGIO', 'CRESCENDO', 'STACCATO', 'LEGATO',
  'FALSETTO', 'VIBRATO', 'TIMBRE', 'OSTINATO', 'POLYRHYTHM',
  'BREAKBEAT', 'SHOEGAZE', 'GRINDCORE', 'DJENT', 'ZYDECO',
  'GAMELAN', 'RAGA', 'AFROBEAT', 'BOSSA', 'KRAUTROCK',
  'SAUDADE', 'LEITMOTIF', 'COUNTERPOINT', 'ATONALITY', 'DISSONANCE',
  'HARMONICS', 'PENTATONIC', 'CHROMATIC', 'MODULATION', 'CADENCE',
  'PORTAMENTO', 'GLISSANDO', 'RUBATO', 'FERMATA', 'SFORZANDO',
  'TRITONE', 'DIMINISHED', 'AUGMENTED', 'MIXOLYDIAN', 'DORIAN',
]);

// ---------- Geography & Landmarks ----------

const GEOGRAPHY_EASY = dedupe([
  'EVEREST', 'AMAZON', 'SAHARA', 'PACIFIC', 'ARCTIC',
  'VOLCANO', 'ISLAND', 'CANYON', 'GLACIER', 'DESERT',
  'PYRAMID', 'COLOSSEUM', 'EIFFEL', 'LIBERTY', 'STONEHENGE',
  'REEF', 'JUNGLE', 'TUNDRA', 'SAVANNA', 'DELTA',
  'PENINSULA', 'CONTINENT', 'EQUATOR', 'TROPICS', 'COMPASS',
  'ATLAS', 'BORDER', 'CAPITAL', 'HARBOR', 'LIGHTHOUSE',
  'MOUNTAIN', 'VALLEY', 'PLATEAU', 'WATERFALL', 'LAGOON',
  'FJORD', 'OASIS', 'STRAIT', 'ARCHIPELAGO', 'CRATER',
]);

const GEOGRAPHY_HARD = dedupe([
  'PANGAEA', 'GONDWANA', 'LAURASIA', 'TECTONIC', 'SUBDUCTION',
  'MORAINE', 'DRUMLIN', 'ESKER', 'KARST', 'STEPPE',
  'TAIGA', 'CHAPARRAL', 'MESETA', 'ALTIPLANO', 'BATHYMETRY',
  'ISTHMUS', 'ATOLL', 'CALDERA', 'FUMAROLE', 'GEYSER',
  'PERMAFROST', 'LOESS', 'ALLUVIAL', 'SCREE', 'CIRQUE',
  'BUTTE', 'MESA', 'ARROYO', 'WADI', 'CENOTE',
  'DOLMEN', 'ZIGGURAT', 'CARAVANSERAI', 'MACHU', 'PETRA',
  'ANGKOR', 'BAGAN', 'CAPPADOCIA', 'SANTORINI', 'PATAGONIA',
]);

// ---------- Current Affairs ----------

const CURRENTAFFAIRS_EASY = dedupe([
  'ELECTION', 'SUMMIT', 'TREATY', 'SANCTION', 'TARIFF',
  'CLIMATE', 'PROTEST', 'REFUGEE', 'PANDEMIC', 'VACCINE',
  'INFLATION', 'RECESSION', 'HOUSING', 'MINIMUM', 'CONGRESS',
  'PARLIAMENT', 'DEBATE', 'POLL', 'BALLOT', 'CAMPAIGN',
  'HEADLINE', 'BREAKING', 'OPINION', 'EDITORIAL', 'SOURCE',
  'NUCLEAR', 'CEASEFIRE', 'EMBARGO', 'ALLIANCE', 'DIPLOMAT',
  'SUBSIDY', 'DEFICIT', 'SURPLUS', 'EXPORT', 'IMPORT',
  'REGULATION', 'PRIVACY', 'CENSORSHIP', 'MISINFORMATION', 'WHISTLEBLOWER',
]);

const CURRENTAFFAIRS_HARD = dedupe([
  'GERRYMANDER', 'FILIBUSTER', 'OMNIBUS', 'QUORUM', 'SUPERMAJORITY',
  'REALPOLITIK', 'DETENTE', 'HEGEMONY', 'MULTIPOLAR', 'AUTARKY',
  'AUSTERITY', 'STAGFLATION', 'QUANTITATIVE', 'ARBITRAGE', 'DERIVATIVE',
  'PETRODOLLAR', 'SOVEREIGNTY', 'BALKANIZE', 'ANNEXATION', 'IRREDENTISM',
  'KLEPTOCRACY', 'OLIGARCH', 'TECHNOCRAT', 'POPULISM', 'NATIVISM',
  'DIVESTITURE', 'EXTERNALITY', 'NEOLIBERAL', 'BRETTONWOODS', 'DAVOS',
  'OPEC', 'BRICS', 'ASEAN', 'INTERPOL', 'HAGUE',
  'RENDITION', 'EXTRADITION', 'JURISDICTION', 'PRECEDENT', 'JURISPRUDENCE',
]);

// ---------- Category registry ----------

const CATEGORIES: Record<CategoryId, WordCategory> = {
  observability: { id: 'observability', label: 'Observability', easy: OBSERVABILITY_EASY, hard: OBSERVABILITY_HARD },
  buzzwords:     { id: 'buzzwords',     label: 'Tech Buzzwords 2026', easy: BUZZWORDS_EASY, hard: BUZZWORDS_HARD },
  influencers:   { id: 'influencers',   label: 'Tech Influencers', easy: INFLUENCERS_EASY, hard: INFLUENCERS_HARD },
  programming:   { id: 'programming',   label: 'Programming', easy: PROGRAMMING_EASY, hard: PROGRAMMING_HARD },
  startups:       { id: 'startups',       label: 'Startup Lingo',    easy: STARTUPS_EASY,       hard: STARTUPS_HARD },
  popculture:     { id: 'popculture',     label: 'Pop Culture',      easy: POPCULTURE_EASY,     hard: POPCULTURE_HARD },
  music:          { id: 'music',          label: 'Music',            easy: MUSIC_EASY,          hard: MUSIC_HARD },
  geography:      { id: 'geography',      label: 'Geography',        easy: GEOGRAPHY_EASY,      hard: GEOGRAPHY_HARD },
  currentaffairs: { id: 'currentaffairs', label: 'Current Affairs',  easy: CURRENTAFFAIRS_EASY, hard: CURRENTAFFAIRS_HARD },
  custom:         { id: 'custom',         label: 'Custom Words',     easy: [],                  hard: [] },
};

export const CATEGORY_LIST: { id: CategoryId; label: string }[] =
  Object.values(CATEGORIES)
    .filter((c) => c.id !== 'custom')
    .map((c) => ({ id: c.id, label: c.label }));

export const DEFAULT_CATEGORY: CategoryId = 'observability';
export const DEFAULT_DIFFICULTY: Difficulty = 'easy';

export function getWordsForGame(
  categoryId: CategoryId,
  difficulty: Difficulty,
  customWords: string[] | null,
): string[] {
  if (categoryId === 'custom' && customWords && customWords.length >= 25) {
    return customWords;
  }
  const cat = CATEGORIES[categoryId] ?? CATEGORIES.observability;
  const pool = difficulty === 'hard' ? cat.hard : cat.easy;
  if (pool.length < 25) return [...CATEGORIES.observability.easy];
  return [...pool];
}

// ---------- Validation ----------

const MIN_WORDS = 25;
const MAX_WORD_LEN = 30;

export function validateWordList(words: unknown): string[] | null {
  if (!Array.isArray(words)) return null;

  const cleaned: string[] = [];
  for (const w of words) {
    if (typeof w !== 'string') return null;
    const trimmed = w.trim().toUpperCase();
    if (trimmed.length > 0 && trimmed.length <= MAX_WORD_LEN) {
      cleaned.push(trimmed);
    }
  }

  const deduped = [...new Set(cleaned)];
  if (deduped.length < MIN_WORDS) return null;
  return deduped;
}

// ---------- Helpers ----------

function dedupe(arr: readonly string[]): string[] {
  return [...new Set(arr.map((s) => s.toUpperCase()))];
}
