# KEKNAMES

Online multiplayer Codenames clone with kekw card art.

## Running (locally)

```bash
npm install
cd client && npm install && npm run build && cd ..
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

1. Create a room and share the 4-letter code
2. Players join and assign themselves to Red or Blue teams
3. Each team picks one Spymaster (click the role badge to toggle)
4. Host selects mode (Words/Pictures) and starts the game
5. Spymasters give one-word clues + a number
6. Operatives click cards to guess. Hit the assassin and you lose.
7. First team to find all their agents wins.
