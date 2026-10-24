# Riichi Table

Play Japanese (riichi) mahjong visually with friends — **online by room code or link**, or **pass-and-play on one device**. Full rules and scoring: calls (chi/pon/kan), riichi and ippatsu, furiten, dora/ura/aka, yaku and yakuman detection, fu and han, honba and riichi sticks, exhaustive and abortive draws, dealer rotation, hanchan with an extra round.

The table is modelled on the AMOS Numbers set: teal mat with a black rim, white tiles with index numerals, the four-lobed wind compass with the dice-count numbers on each edge, an orange 東 dealer plaque, and colour point sticks (10 000 yellow · 5 000 vermilion · 1 000 blue · 500 teal · 100 white).

## Run it

```bash
npm install
npm start          # http://localhost:3000
npm test           # engine + fuzz tests
```

Set `PORT` to change the port. On your own Wi-Fi, friends can open `http://<your PC's IP>:3000` (find it with `ipconfig`; allow TCP 3000 through Windows Firewall).

## Host it for free (fixed HTTPS URL)

The repo includes a `render.yaml` Blueprint for [Render](https://render.com):

1. Sign in to Render with GitHub → **New → Blueprint** → choose this repo → **Apply**.
2. A minute later the game is live at `https://riichi-table-<something>.onrender.com`. Every push to `main` redeploys.

Render's free plan gives you TLS (the page and the game connection are both encrypted), a fixed URL, and it idles after 15 minutes with nobody connected — the first visit after that takes ~30–60 s to wake up. Fly.io or Railway work the same way (`npm start`, port from `PORT`).

### What keeps it safe

- The server is authoritative: clients only send actions, and every action is validated against the rules before it changes anything. Each player receives only the tiles they are allowed to see.
- HTTPS is forced behind the host's proxy; the page sends a strict Content-Security-Policy (scripts only from this origin), `X-Frame-Options: DENY`, `nosniff`, HSTS and a no-referrer policy.
- WebSockets are accepted only from the game's own origin, capped at 4 KB per message and ~20 messages/s per connection; guessing room codes drops the connection after a few misses. Rooms are capped (`MAX_ROOMS`, default 200); a running game is kept for a week after its last move, an empty lobby for a day.
- The runtime is pinned to a patched Node.js (`render.yaml`, `.node-version`, `engines` in `package.json`) — currently 22.23.4, the October 2026 security release. Bump it when Node publishes a new security release.
- Names are trimmed to printable characters and escaped before rendering. Nothing is stored: no accounts, no database, no cookies.
- Room codes are 5 characters from a 32-letter alphabet (~33 million combinations) — share them only with the people you want at the table.
- **Games survive restarts.** Room state is in memory, but every update also sends each player an encrypted snapshot of the room (AES-256-GCM, sealed with `ROOM_SECRET`) that their browser keeps. If the server restarts or a free host goes to sleep, the first player to return hands the snapshot back and the game is rebuilt exactly where it was; copies are numbered, so if someone returns with an older copy and another player later brings a newer one, the newer one wins. The Render blueprint generates a stable `ROOM_SECRET`; set one yourself on any other host, or saved games will not outlive a restart.

## How to play

- **Online:** enter a name → *Create online room* → share the 5-letter code or the link. Friends join from the home screen; empty seats are filled by bots when the host starts. Players can refresh or drop and rejoin — the server keeps the game.
- **Playing at your own pace:** a game waits for anyone who goes offline. Open the room link again later and your seat is restored (even from a new device: you'll be offered the away seats to pick up). If the group would rather not wait, the host can *Let a bot play for them* until they return — control hands back automatically the moment they reconnect. Running games are kept for a week after the last move, and the page only keeps the server awake while it is actually on screen — a tab in the background lets a free host sleep, and reconnects (restoring the game if needed) when you come back to it.
- **Pass-and-play:** enter up to four names (blank seats become bots); the device shows a hand-off screen before revealing each person's hand.
- **Score calculator** (top bar / home screen): build any hand from a tile palette or type it in shorthand (`234m 567p 22s 333z 777z`), add calls, dora, riichi, winds and honba, and see the yaku, fu and payment breakdown.
- Click a tile to discard; use *Riichi* then pick the tile; *Tsumo* / *Ron* / *Pon* / *Chi* / *Kan* appear when legal. The status line shows your waits and furiten.

## Layout

```
shared/   rules engine, used by both server and browser (ES modules)
  tiles.js   tile ids, parsing, dora, seeded RNG
  hand.js    shanten, decomposition, waits
  yaku.js    yaku, fu, han → points, payments
  game.js    game state machine, legal actions, per-seat views
  bot.js     simple bot
server/   static server + WebSocket rooms (authoritative state)
public/   client: table UI, SVG tiles, compass and sticks
test/     node:test suites (scoring table, yaku, 25-game fuzz)
```

Rule toggles (Settings screen, remembered per device; the host can change them in the waiting room until the game starts): hanchan vs. east-only (default east-only), red fives, open tanyao, double/triple ron vs. head bump, extra round if nobody has 30 000. Defaults live in `shared/game.js` (`DEFAULT_RULES`).

## Switching tile art

`public/tiles.js` is the current tile art (v3: AMOS-style brush calligraphy, index in the top-right corner). Earlier renderers are kept beside it — `public/tiles-v2.js` (fine grid, bold top-left index, Western inks) and `public/tiles-v1.js` (the original) —. To switch, point the `./tiles.js` imports in `public/app.js` and `public/help.js` at the renderer you want (v3 and v2 share the same gradients; v1 needs its own `SHARED_DEFS`, which it exports). The whole pre-v2 app is commit `e019c57` on `main`.
