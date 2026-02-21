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

// ---------- Category registry ----------

const CATEGORIES: Record<CategoryId, WordCategory> = {
  observability: { id: 'observability', label: 'Observability', easy: OBSERVABILITY_EASY, hard: OBSERVABILITY_HARD },
  buzzwords:     { id: 'buzzwords',     label: 'Tech Buzzwords 2026', easy: BUZZWORDS_EASY, hard: BUZZWORDS_HARD },
  influencers:   { id: 'influencers',   label: 'Tech Influencers', easy: INFLUENCERS_EASY, hard: INFLUENCERS_HARD },
  programming:   { id: 'programming',   label: 'Programming', easy: PROGRAMMING_EASY, hard: PROGRAMMING_HARD },
  startups:      { id: 'startups',      label: 'Startup Lingo', easy: STARTUPS_EASY, hard: STARTUPS_HARD },
  custom:        { id: 'custom',        label: 'Custom Words', easy: [], hard: [] },
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
