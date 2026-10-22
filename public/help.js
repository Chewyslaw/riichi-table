// Help content: rules of play and the yaku reference. Rendered into the help modal.
import { parseKinds } from '../shared/tiles.js';
import { kindHtml } from './tiles.js';

/** "234m 567p 345s 66s 88p" → row of small tiles, with spaces separating groups. */
function tiles(str, size = '') {
  return `<span class="ex ${size}">${str.split(/\s+/).map((g) => `<span class="grp">${parseKinds(g).map((k) => kindHtml(k)).join('')}</span>`).join('')}</span>`;
}

export function rulesHtml() {
  return `
<h2>How to play riichi mahjong</h2>
<nav class="toc"><a href="#h-goal">Goal</a><a href="#h-flow">A hand</a><a href="#h-calls">Calls</a><a href="#h-riichi">Riichi</a><a href="#h-win">Winning</a><a href="#h-furiten">Furiten</a><a href="#h-dora">Dora</a><a href="#h-score">Scoring</a><a href="#h-draw">Draws</a><a href="#h-game">The game</a><a href="#h-app">In this app</a></nav>

<h3 id="h-goal">Goal</h3>
<p>Four players, 136 tiles: three suits of 1–9 (characters 萬, circles, bamboo), four winds (東南西北) and three dragons (白 發 中), four of each. Build a complete hand of <b>four sets and a pair</b> — a set is three identical tiles (a triplet) or three in a row of one suit (a run) — ${tiles('123m 456p 789s 111z 55z', 'sm')}. Two special shapes also win: <b>seven pairs</b> ${tiles('11m 44m 77p 22s 55s 33z 66z', 'sm')} and <b>thirteen orphans</b> (one of every terminal and honor, plus any one of them twice).</p>

<h3 id="h-flow">A hand</h3>
<ul>
<li>Everyone gets 13 tiles. The dealer (East, 東 marker) starts; play goes counter-clockwise.</li>
<li>On your turn you <b>draw</b> a tile, then <b>discard</b> one into your pond in front of you. Click a tile to discard it.</li>
<li>The last 14 tiles of the wall are the <b>dead wall</b>: dora indicators and the replacement draws for kans. The game shows how many live tiles remain.</li>
<li>When the live wall runs out the hand is an <b>exhaustive draw</b> — see Draws.</li>
</ul>

<h3 id="h-calls">Calls — using other players' discards</h3>
<p>When someone discards a tile you can claim it to complete a set. The claimed set is placed face-up beside your hand and your hand is now <b>open</b>, which rules out some yaku and lowers others.</p>
<ul>
<li><b>Pon</b> — you hold two of the tile; take it from anyone to make a triplet.</li>
<li><b>Chi</b> — you hold two tiles that run with it; only from the player <b>to your left</b>. After a chi or pon you may not discard the tile you just called (or the tile that would have completed the same run from the other side).</li>
<li><b>Kan</b> — four of a kind. <b>Open kan</b> claims a discard with three in hand; <b>closed kan</b> uses four from your hand (your hand stays closed); <b>added kan</b> adds the fourth tile to a pon you already have. Every kan draws a replacement tile from the dead wall and reveals another dora indicator. A hand that wins on the replacement tile scores <i>Rinshan kaihou</i>.</li>
<li><b>Ron</b> — the discard completes your hand: you win off that player, who pays the whole amount. Ron beats pon beats chi when several players want the same tile; two or three players may ron the same tile.</li>
<li>Calls interrupt everyone's "first turn" and cancel ippatsu.</li>
</ul>

<h3 id="h-riichi">Riichi</h3>
<p>With a <b>closed</b> hand that is one tile from winning (<b>tenpai</b>), at least 1 000 points and at least four live tiles left, you may declare <b>riichi</b> by pressing Riichi and discarding sideways. You pay a 1 000-point stick to the pot (the winner of the hand takes the pot). From then on you must discard every tile you draw unless it wins (<b>tsumo</b>) or makes a closed kan that keeps your waits the same. Riichi is a yaku, reveals ura dora if you win, and winning on the very next uncalled draw or discard adds <b>ippatsu</b>. Riichi on your first discard with no calls made is <b>double riichi</b> (2 han).</p>

<h3 id="h-win">Winning</h3>
<ul>
<li><b>Tsumo</b> — you draw the winning tile. Everyone pays you (the dealer pays double; if you are dealer, everyone pays the same).</li>
<li><b>Ron</b> — you take a discard to win; only the discarder pays.</li>
<li>A winning hand must have at least one <b>yaku</b> (see the Yaku reference). Dora alone is not enough. The buttons only appear when a win is legal.</li>
<li>A complete hand can be read several ways; the game scores the best one for you.</li>
</ul>

<h3 id="h-furiten">Furiten — when you cannot ron</h3>
<p>You may not ron if any of your waiting tiles is in your own pond, even one you discarded long ago (the status line shows <b>FURITEN</b>). You are also furiten for one turn after passing on a tile you could have won on, and for the rest of the hand if that happens while you are in riichi. Tsumo is always allowed.</p>

<h3 id="h-dora">Dora</h3>
<p>The tile after each revealed indicator is a <b>dora</b>: each copy in your winning hand adds 1 han (9 → 1, 北 → 東, 中 → 白). <b>Red fives</b> (one per suit, optional) are worth 1 han each. Riichi winners also count <b>ura dora</b> from the hidden indicators underneath. Dora add han but are not yaku.</p>

<h3 id="h-score">Scoring</h3>
<p>A win is worth <b>han</b> (from yaku and dora) and <b>fu</b> (small points for the hand's shape: closed ron, triplets, kans, a yakuhai pair, and single or middle waits). Base points are fu × 2<sup>han+2</sup>, capped at a <b>mangan</b> (2 000). Above that only han matter: 6–7 <b>haneman</b>, 8–10 <b>baiman</b>, 11–12 <b>sanbaiman</b>, 13+ or a yakuman hand 8 000. A ron pays 4× base (6× if the winner is dealer); a tsumo splits it 1/1/2 (dealer pays double) or 2/2/2 for a dealer. Each <b>honba</b> counter adds 300 to a ron or 100 from each payer on tsumo. Riichi sticks in the pot go to the winner. Scores are shown as point sticks: 10 000 yellow, 5 000 red, 1 000 blue, 100 white.</p>

<h3 id="h-draw">Draws</h3>
<ul>
<li><b>Exhaustive draw</b> — the wall runs out. Players in tenpai reveal and share 3 000 points paid by those who are not (1–3 tenpai players). The dealer keeps the deal if tenpai. Honba goes up by one.</li>
<li><b>Abortive draws</b> redeal the hand with the dealer kept and honba +1: nine different terminals/honors on your first draw (you may choose to redeal), all four first discards the same wind, four riichi declarations, or four kans by two or more players.</li>
</ul>

<h3 id="h-game">The game</h3>
<p>A <b>hanchan</b> is an East round and a South round of four hands each; the dealer rotates after every hand unless the dealer won or was tenpai at a draw (then the same dealer plays again, with honba +1). Everyone starts with 25 000. The game ends after South 4, or when someone drops below zero. If nobody has reached 30 000 at the end, a West round is played as sudden death. In the last hand a dealer who wins while leading with 30 000+ ends the game.</p>

<h3 id="h-app">In this app</h3>
<ul>
<li><b>Hanchan</b> off = East round only. <b>Red fives</b> and <b>open tanyao</b> (tanyao with calls) can be switched off when creating a game.</li>
<li>Hover any tile to light up every visible copy of it. The status line shows your waits, shanten (how many tiles from tenpai) and furiten.</li>
<li>After a hand, <i>Look at the table</i> shows the revealed hands; the host presses <i>Next hand</i> online.</li>
<li>Empty seats are played by bots. Animation speed is in Settings.</li>
</ul>`;
}

// Closed-hand-only yaku, then yaku that also work with an open hand — each ordered by han, commonest first.
const CLOSED_YAKU = [
  { name: 'Riichi', han: '1', note: 'Declare with a closed tenpai hand and a 1 000-point stick; discard sideways.' },
  { name: 'Menzen tsumo', han: '1', note: 'Self-draw win with a closed hand.' },
  { name: 'Pinfu', han: '1', note: 'Four runs, a pair that is not a yakuhai tile, and a two-sided wait.', ex: '234m 567p 456s 78s 22p' },
  { name: 'Ippatsu', han: '1', note: 'Win within one uninterrupted turn of declaring riichi.' },
  { name: 'Iipeikou', han: '1', note: 'Two identical runs.', ex: '334455m 678p 999s 22z' },
  { name: 'Chiitoitsu', han: '2', note: 'Seven different pairs. Always 25 fu.', ex: '11m 44m 77p 22s 55s 33z 66z' },
  { name: 'Double riichi', han: '2', note: 'Riichi on your first discard with no calls before it.' },
  { name: 'Ryanpeikou', han: '3', note: 'Two sets of identical runs.', ex: '223344m 667788p 55s' },
];
const OPEN_YAKU = [
  { name: 'Yakuhai', han: '1 each', note: 'A triplet of a dragon, your seat wind or the round wind (a wind that is both counts twice).', ex: '555z 123m 456p 789s 22s' },
  { name: 'Tanyao', han: '1', note: 'Only simples (2–8). Open tanyao can be turned off.', ex: '234m 567p 345s 666s 88p' },
  { name: 'Haitei raoyue', han: '1', note: 'Tsumo on the last live tile.' },
  { name: 'Houtei raoyui', han: '1', note: 'Ron on the last discard of the hand.' },
  { name: 'Rinshan kaihou', han: '1', note: 'Win on the replacement tile after a kan.' },
  { name: 'Chankan', han: '1', note: 'Ron on the tile someone adds to a pon (added kan).' },
  { name: 'Toitoi', han: '2', note: 'Four triplets (or kans).', ex: '111m 444p 777s 222z 99s' },
  { name: 'Sanshoku doujun', han: '2 · open 1', note: 'The same run in all three suits.', ex: '345m 345p 345s 777z 22m' },
  { name: 'Ittsu', han: '2 · open 1', note: '1–2–3, 4–5–6, 7–8–9 of one suit.', ex: '123456789m 444p 22s' },
  { name: 'Chanta', han: '2 · open 1', note: 'Every set and the pair contain a terminal or honor, with at least one run.', ex: '123m 789p 111z 999s 11p' },
  { name: 'Sanankou', han: '2', note: 'Three closed triplets (a triplet completed by ron does not count).', ex: '111m 444p 777s 23s 99s' },
  { name: 'Shousangen', han: '2', note: 'Two dragon triplets and a pair of the third.', ex: '555z 666z 77z 123m 456s' },
  { name: 'Honroutou', han: '2', note: 'Only terminals and honors (so also toitoi or chiitoitsu).', ex: '111m 999p 111z 777z 99s' },
  { name: 'Sanshoku doukou', han: '2', note: 'The same triplet in all three suits.', ex: '222m 222p 222s 456m 99p' },
  { name: 'Sankantsu', han: '2', note: 'Three kans.' },
  { name: 'Honitsu', han: '3 · open 2', note: 'One suit plus honors.', ex: '123m 666m 999m 111z 55z' },
  { name: 'Junchan', han: '3 · open 2', note: 'Every set and the pair contain a terminal, no honors.', ex: '123m 789p 111s 789s 99m' },
  { name: 'Chinitsu', han: '6 · open 5', note: 'All one suit, no honors.', ex: '123m 456m 678m 999m 22m' },
];

const YAKUMAN = [
  { name: 'Daisangen', note: 'All three dragon triplets.', ex: '555z 666z 777z 123m 99p' },
  { name: 'Suuankou', note: 'Four closed triplets (single wait: double).', ex: '111m 444p 777s 222z 99s' },
  { name: 'Kokushi musou', note: 'Thirteen orphans: every terminal and honor once, one of them twice. 13-sided wait: double.', ex: '19m 19p 19s 1234567z 1z' },
  { name: 'Shousuushii', note: 'Three wind triplets and a pair of the fourth.', ex: '111z 222z 333z 44z 567p' },
  { name: 'Daisuushii', note: 'All four wind triplets (double yakuman).', ex: '111z 222z 333z 444z 55p' },
  { name: 'Tsuuiisou', note: 'All honors.', ex: '111z 333z 555z 666z 77z' },
  { name: 'Chinroutou', note: 'All terminals.', ex: '111m 999m 111p 999s 99p' },
  { name: 'Ryuuiisou', note: 'All green: 2, 3, 4, 6, 8 of bamboo and 發.', ex: '234s 666s 888s 666z 22s' },
  { name: 'Chuuren poutou', note: '1112345678999 of one suit plus any tile of it (nine-sided wait: double).', ex: '1112345678999m 5m' },
  { name: 'Suukantsu', note: 'Four kans.' },
  { name: 'Tenhou', note: 'Dealer wins on the first draw.' },
  { name: 'Chiihou', note: 'Non-dealer wins on their first draw with no calls before it.' },
];

export function yakuHtml() {
  const row = (y) => `<div class="yrow"><div class="yhead"><b>${y.name}</b><span class="han">${y.han || 'Yakuman'}</span></div><div class="ynote">${y.note}</div>${y.ex ? tiles(y.ex) : ''}</div>`;
  return `
<h2>Yaku reference</h2>
<nav class="toc"><a href="#y-closed">Closed hand only</a><a href="#y-open">Open or closed</a><a href="#y-yakuman">Yakuman</a><a href="#y-points">Points table</a></nav>
<p class="note">A winning hand needs at least one yaku. Dora, red fives and ura dora add han but are not yaku. Lists run from the most common to the rarest, by han.</p>
<h3 id="y-closed">Closed hand only</h3>
<p class="note">No calls (closed kans are fine).</p>
<div class="ylist">${CLOSED_YAKU.map(row).join('')}</div>
<h3 id="y-open">Open or closed hand</h3>
<p class="note">"2 · open 1" means 2 han closed, 1 han with calls.</p>
<div class="ylist">${OPEN_YAKU.map(row).join('')}</div>
<h3 id="y-yakuman">Yakuman</h3>
<div class="ylist">${YAKUMAN.map(row).join('')}</div>
<h3 id="y-points">Points (non-dealer ron · dealer ron)</h3>
<table class="pts">
<tr><th>fu \\ han</th><th>1</th><th>2</th><th>3</th><th>4</th></tr>
<tr><td>20 (pinfu tsumo)</td><td>—</td><td>400/700 · 700 all</td><td>700/1300 · 1300 all</td><td>1300/2600 · 2600 all</td></tr>
<tr><td>25 (chiitoitsu)</td><td>—</td><td>1600 · 2400</td><td>3200 · 4800</td><td>6400 · 9600</td></tr>
<tr><td>30</td><td>1000 · 1500</td><td>2000 · 2900</td><td>3900 · 5800</td><td>7700 · 11600</td></tr>
<tr><td>40</td><td>1300 · 2000</td><td>2600 · 3900</td><td>5200 · 7700</td><td>8000 · 12000</td></tr>
<tr><td>50</td><td>1600 · 2400</td><td>3200 · 4800</td><td>6400 · 9600</td><td>8000 · 12000</td></tr>
<tr><td>60</td><td>2000 · 2900</td><td>3900 · 5800</td><td>7700 · 11600</td><td>8000 · 12000</td></tr>
<tr><td>70</td><td>2300 · 3400</td><td>4500 · 6800</td><td>8000 · 12000</td><td>8000 · 12000</td></tr>
</table>
<p class="note">5 han = mangan 8000 · 12000 &nbsp;·&nbsp; 6–7 haneman 12000 · 18000 &nbsp;·&nbsp; 8–10 baiman 16000 · 24000 &nbsp;·&nbsp; 11–12 sanbaiman 24000 · 36000 &nbsp;·&nbsp; 13+ / yakuman 32000 · 48000. Tsumo splits the total: non-dealer pays ¼ and the dealer ½; a dealer's tsumo takes ⅓ from each.</p>`;
}
