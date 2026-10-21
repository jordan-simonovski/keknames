# KEKNAMES

Online multiplayer Codenames clone with kekw card art.

## Running (locally)

```bash
npm ci
npm run build
npm start
```

## Dev

```bash
# Terminal 1: backend with auto-restart
npm run dev:server

# Terminal 2: React frontend with HMR
npm run dev:client
```

Open `http://localhost:5173` (Vite dev server proxies socket.io to port 3000).

## How to Play

1. Create a room and share the 6-letter code
2. Players join and assign themselves to Red or Blue teams
3. Each team picks one Spymaster (click the role badge to toggle)
4. Host selects mode (Words/Pictures) and starts the game
5. Spymasters give one-word clues + a number
6. Operatives click cards to guess. Hit the assassin and you lose.
7. First team to find all their agents wins.

Classic games require exactly one spymaster and at least one operative per team.
Roles and teams are fixed until the host returns everyone to the lobby. Both
spymasters intentionally see the entire classic key; operatives and spectators
receive only revealed card colors. With multiple operatives, a guess requires
votes from more than half the team's operatives.

Duet uses the clue giver's key to evaluate guesses. Bystanders remain available
for the other player, and correct guesses can continue without a count limit.
This implementation ends the game after nine spent tokens; it does not implement
the tabletop sudden-death round.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm audit
npm audit --prefix client
```

With a local server running, also run `npm run test:integration`. Set `GAME_URL`
if it is listening somewhere other than `http://127.0.0.1:3000`.

The server tests exercise room event handlers, secret payload filtering, session
replacement, voting, deadlines, malformed input, and classic/Duet rules.

## Hosting

Use HTTPS in production. Set `ALLOWED_ORIGIN` to the public origin (for example,
`https://game.example.com`) if a reverse proxy rewrites the Host header, or if the
client is served from a separate origin. Without this setting, browser socket
connections must have the same host as the request. This check applies to both
polling and WebSocket handshakes. No forwarded headers are trusted for rate limits;
behind a proxy, connection and room admission limits share the proxy's address.
Configure per-client limits at the trusted edge for larger deployments.

`PORT` defaults to 3000. `HOST` defaults to `0.0.0.0`; use `HOST=127.0.0.1` for local
testing. Rooms are held in memory, so a server restart ends ongoing games.

See [the security and gameplay sweep](docs/security-gameplay-audit.md) for findings,
remaining trust boundaries, and prioritized improvements.
