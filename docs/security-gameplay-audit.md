# Security and gameplay sweep — 21 October 2026

## Playtest exploit

An operative could send `assign-team` with their own public player ID and
`role: 'spymaster'` during an active game. The server accepted it without checking
the caller or game phase. The next game-state broadcast contained every card's
type. The player could then switch back to operative, retaining the key they had
already received. Changing another player's team or role was also unrestricted.

This reproduces the reported symptom; without playtest logs it does not establish
which technique that player actually used. Both legitimate **classic spymasters**
are supposed to see the entire key, including opposing agents and the assassin.
An opposing operative or spectator must never receive it during play.

The original handler tests failed for six distinct authorization scenarios. All
now pass, including a real WebSocket reproduction that inspects outbound card
payloads rather than relying on what the UI draws.

## Security fixes

| Finding | Fix |
| --- | --- |
| Any player could change anybody's team/role, including during play | Lobby changes require self or host authority. All team/role changes are blocked while a board exists, including host changes. |
| Any player could occupy or switch Duet seats and obtain either key | Seats are locked during games; lobby changes require self or host authority. Only the host may replace another occupant. |
| A replacement connection left the previous socket authorized | Reconnect revokes the old socket; commands and explicit leaving verify current socket ownership and live room membership. |
| A spymaster left alone could guess using their complete key | Only operatives can guess or end classic turns. Every classic start/rematch needs one spymaster and at least one operative per team. No development-mode bypass. |
| A single vote could be treated as a majority of several operatives | Confirmation requires more than half of eligible operatives. Departing/disconnected players' votes are removed. Opponents and spectators no longer receive team votes. |
| Duet revealed both key colors for guessed cards, enabling deduction | During play, payloads contain only the viewer's own key and public guess results. Full keys are available after the game ends. |
| Host start/rematch/settings events could alter a running round | Settings are lobby-only; start rejects an existing board; rematch requires a completed game. The host can explicitly abort to the lobby. |
| Actions could beat the one-second timeout polling interval | Game actions enforce the deadline before applying the request. |
| Browser origins were reflected without restriction | Same-host or explicit `ALLOWED_ORIGIN` enforcement covers WebSocket and polling handshakes; CORS alone does not cover WebSockets. |
| Room guessing, reconnect churn, payload and memory growth | Six-letter cryptographic room codes; bounded per-address admission/connection windows; 2,000 connection and 1,000 room caps; 96 KiB packet limit; 500-event game history; bounded client chat history. |
| Vulnerable dependency versions | Updated both lockfiles; patched socket/parser/transport packages and build tools, upgraded Vitest to 4, and pinned a compatible patched `qs` override. Both npm audits report zero known vulnerabilities at verification time. |

Secret card variants remain withheld until reveal. Board generation uses
`node:crypto` randomness. Player IDs and room codes are not session credentials;
restoration requires a separate random session token. User-provided chat, names,
and word labels are rendered as text, not HTML.

## Gameplay and quality-of-life fixes

- Duet evaluates guesses against the clue giver's key, so reading your own key
  cannot tell you the correct answers when guessing.
- A Duet bystander neither counts as a found green nor permanently covers the
  card for the other player. Public markers identify which guesser hit it.
- Duet supports continued correct guesses regardless of clue count and skips
  clue-giving sides with no green cards left. Its nine-token loss rule remains an
  explicit house rule; tabletop sudden death is not implemented.
- Classic zero clues now allow continued guesses, matching the displayed rules.
  Both modes reject multiword clues and allow previously revealed board words.
- Standard, D&D, 90s, Fast Food, and Pokémon category options now pass server
  validation. Lobby start hints match server requirements.
- New rooms receive an activity timestamp immediately. Idle expiry frees its
  bookkeeping, and the same connection can create another room afterwards.
- Session expiry clears stale game/chat UI. Replaced tabs explain what happened
  without deleting the new tab's shared session cookie. Disconnected game actions
  are not queued for later replay. Create/join requests time out instead of hanging.
- Added an explicit host return-to-lobby action for abandoned rounds, longer-word
  fitting on classic cards, keyboard-operable Duet cards, and corrected default
  category text. Rematches reset the sound detection state.
- TypeScript UI code now participates in linting and the root typecheck command.
  The root test command now runs meaningful server regressions.

## Remaining opportunities, in priority order

These are further product work, not claims of implemented features.

| Priority | Opportunity | Benefit / decision |
| --- | --- | --- |
| High | Host approval or room locking for new arrivals, plus kick/ban controls | Codes are invitations, not verified identity. Approval is preferable for public or streamed games. Decide whether spectators should require admission too. |
| High | Reconnecting indicators and a short pause when an essential player drops | The existing 60-second reconnect grace preserves roles, but absent players are not visibly identified and the clock keeps running. |
| High | Accessible classic board and color-independent labels | Classic's canvas still needs a keyboard/screen-reader interaction layer and explicit team/type cues beyond color. |
| Medium | Review-board mode after game over | The server provides the completed key, but the classic result overlay covers the board. Add a dismiss/reopen result control. |
| Medium | Explicit confirmation for single-operative and Duet guesses | Reduces accidental taps. Multi-operative classic guesses already use vote/confirm; solo-operative classic and Duet guesses are immediate. |
| Medium | Preserve rejected clue input with inline validation | The current input clears when submitted, so correcting a server-rejected clue requires retyping. An acknowledgement-based clue form would resolve this. |
| Medium | Full tabletop Duet rules | Add sudden death and enforce at least one guess before voluntarily ending a turn if strict tabletop parity is desired. |
| Medium | Mobile chat unread tracking and scroll behavior | Avoid treating older messages as unread after the rolling chat cap, and don't auto-scroll readers away from earlier messages. |
| Low | Reduce continuous canvas redraws and image load duplication | Cache in-flight image requests, redraw when assets finish loading, and respect reduced-motion preferences. |
| Low | Shared server/client domain types | Duplicated models can drift. Consolidate authoritative definitions while keeping wire-view types separate from secret server state. |

## Trust boundaries and deployment

- A legitimate spymaster can communicate the key out of band. The game cannot
  prevent collusion, screenshots, or someone joining under another identity before
  a round begins. The host remains trusted to assign roles and abort rounds.
- The session cookie remains a JavaScript-written bearer credential; HTTPS adds
  `Secure`. Moving issuance to an HTTP endpoint would allow `HttpOnly` cookies.
  This sweep found no HTML injection sink, but that is not a guarantee against
  every possible future XSS path.
- Behind a proxy, set `ALLOWED_ORIGIN` to the public origin if Host is rewritten.
  Rate limiting deliberately ignores untrusted forwarded IP headers. For public
  scale, configure per-client limits at the trusted edge; otherwise clients can
  share the proxy's application-level budget. Distributed denial of service needs
  infrastructure protection beyond these application caps.
- The app stores rooms only in memory. Deploying/restarting ends active games.
  These changes are local; no production service was deployed or restarted.

## Verification

- `npm test`: server rule/handler regressions; frontend runner currently has no
  component test files.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- `GAME_URL=http://127.0.0.1:3001 npm run test:integration`: actual WebSocket
  foreign-Origin rejection, four-player setup, attempted key theft, and session
  replacement with a redacted operative payload.
- `npm audit` and `npm audit --prefix client`: no known advisories remaining.
- In-app browser: create a room, assign four players, verify role readiness,
  select Pokémon, start a round, and reload into the same role/board.

References: [Socket.IO origin protection](https://socket.io/docs/v4/handling-cors)
and [official Duet rules](https://filemanager.czechgames.com/storage/files/codenames-duet/rules/codenames-duet-rules-en.pdf).
