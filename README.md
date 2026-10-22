# Riichi Table

Play Japanese (riichi) mahjong visually with friends — **online by room code or link**, or **pass-and-play on one device**. Full rules and scoring: calls (chi/pon/kan), riichi and ippatsu, furiten, dora/ura/aka, yaku and yakuman detection, fu and han, honba and riichi sticks, exhaustive and abortive draws, dealer rotation, hanchan with an extra round.

The table is modelled on the AMOS Numbers set: teal mat with a black rim, white tiles with index numerals, the four-lobed wind compass with the dice-count numbers on each edge, an orange 東 dealer plaque, and colour point sticks (10 000 yellow · 5 000 vermilion · 1 000 blue · 500 teal · 100 white).

## Run it

```bash
npm install
npm start          # http://localhost:3000
npm test           # engine + fuzz tests
```

Set `PORT` to change the port. Anyone who can reach the server can create or join a room; to play with friends over the internet, host it somewhere public (any Node host works, WebSockets are on the same port) or tunnel localhost (e.g. `npx localtunnel --port 3000`).

## How to play

- **Online:** enter a name → *Create online room* → share the 5-letter code or the link. Friends join from the home screen; empty seats are filled by bots when the host starts. Players can refresh or drop and rejoin — the server keeps the game.
- **Pass-and-play:** enter up to four names (blank seats become bots); the device shows a hand-off screen before revealing each person's hand.
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

Rules toggles (home screen): hanchan vs. east-only, red fives, open tanyao. Defaults live in `shared/game.js` (`DEFAULT_RULES`).
