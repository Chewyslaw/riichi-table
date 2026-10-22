// Help content: rules of play and the yaku reference. Rendered into the help modal.
import { parseKinds } from '../shared/tiles.js';
import { kindHtml, tileHtml, compassSvg, plaqueSvg, diceSvg, stickSvg } from './tiles.js';

/** "234m 567p 345s 66s 88p" → row of small tiles, with spaces separating groups. */
function tiles(str, size = '') {
  return `<span class="ex ${size}">${str.split(/\s+/).map((g) => `<span class="grp">${parseKinds(g).map((k) => kindHtml(k)).join('')}</span>`).join('')}</span>`;
}

export function rulesHtml() {
  return `
<h2>How to play riichi mahjong</h2>
<nav class="toc"><a href="#h-goal">Goal</a><a href="#h-flow">A hand</a><a href="#h-shanten">Shanten</a><a href="#h-calls">Calls</a><a href="#h-riichi">Riichi</a><a href="#h-win">Winning</a><a href="#h-furiten">Furiten</a><a href="#h-dora">Dora</a><a href="#h-score">Scoring</a><a href="#h-draw">Draws</a><a href="#h-game">The game</a><a href="#h-app">In this app</a></nav>

<h3 id="h-goal">Goal</h3>
<p>Four players, 136 tiles: three suits of 1–9 (characters 萬, circles, bamboo), four winds (東南西北) and three dragons (白 發 中), four of each. Build a complete hand of <b>four sets and a pair</b> — a set is three identical tiles (a triplet) or three in a row of one suit (a run) — ${tiles('123m 456p 789s 111z 55z', 'sm')}. Two special shapes also win: <b>seven pairs</b> ${tiles('11m 44m 77p 22s 55s 33z 66z', 'sm')} and <b>thirteen orphans</b> (one of every terminal and honor, plus any one of them twice).</p>

<h3 id="h-flow">A hand</h3>
<ul>
<li>Everyone gets 13 tiles. The dealer (East, 東 marker) starts; play goes counter-clockwise.</li>
<li>On your turn you <b>draw</b> a tile, then <b>discard</b> one into your pond in front of you. Click a tile to discard it.</li>
<li>The last 14 tiles of the wall are the <b>dead wall</b>: dora indicators and the replacement draws for kans. The game shows how many live tiles remain.</li>
<li>When the live wall runs out the hand is an <b>exhaustive draw</b> — see Draws.</li>
</ul>

<h3 id="h-shanten">Shanten — how far from winning you are</h3>
<p><b>Shanten</b> counts how many tiles your hand still needs to swap to reach <b>tenpai</b> (one tile away from a complete hand). The status line under your hand shows it, and it drops as the hand improves:</p>
<ul>
<li><b>Tenpai</b> (0-shanten) — one specific tile wins: ${tiles('234m 567p 456s 78s 22p', 'sm')} is waiting on 6s or 9s. The game lists your waits.</li>
<li><b>1-shanten</b> — one good draw makes you tenpai: ${tiles('234m 567p 456s 78s 2p 5p', 'sm')} needs a 2p or 5p to pair up (or a 6s/9s to finish the run and leave a single wait).</li>
<li><b>2-shanten</b> — two useful draws needed: ${tiles('234m 567p 45s 78s 2p 5p 9p', 'sm')} has two sets, two half-runs and no pair yet.</li>
<li>A fresh deal is usually 3- to 4-shanten; 6 is the worst a 13-tile hand can be.</li>
</ul>
<p class="note">Each useful draw lowers the count by one, so a 2-shanten hand needs at least two more good draws before it can even wait for its winning tile. Discarding the tile that keeps the count lowest (or gives the most ways to lower it) is the core of hand-building. Seven pairs and thirteen orphans count their own way, and the game shows whichever is closest.</p>

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
<li><b>Two players ron the same discard</b> — with <b>Double / triple ron</b> on (the default) everyone who called wins and the discarder pays each of them in full, honba included. The riichi sticks in the pot go to the winner nearest in turn order after the discarder, and if either winner is the dealer, the dealer keeps the seat. With it off (<b>head bump</b>, <i>atamahane</i>) only the player nearest in turn order wins; the other ron is void. Choose in Settings.</li>
<li>A winning hand must have at least one <b>yaku</b> (see the Yaku reference). Dora alone is not enough. The buttons only appear when a win is legal.</li>
<li>A complete hand can be read several ways; the game scores the best one for you.</li>
</ul>

<h3 id="h-furiten">Furiten — when you cannot ron</h3>
<p>You may not ron if any of your waiting tiles is in your own pond, even one you discarded long ago (the status line shows <b>FURITEN</b>). You are also furiten for one turn after passing on a tile you could have won on, and for the rest of the hand if that happens while you are in riichi. Tsumo is always allowed.</p>
<p class="note">Declaring riichi while furiten is legal but risky: you are locked into a hand that can only win by self-draw, and if you then pass on a winning discard you stay furiten until the hand ends. The app warns you before you confirm such a riichi.</p>

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
  { name: 'Riichi', en: 'Ready hand', han: '1', note: 'Declare with a closed tenpai hand and a 1 000-point stick; discard sideways.' },
  { name: 'Menzen tsumo', en: 'Fully concealed self-draw', han: '1', note: 'Self-draw win with a closed hand.' },
  { name: 'Pinfu', en: 'All runs, no points', han: '1', note: 'Four runs, a pair that is not a yakuhai tile, and a two-sided wait.', ex: '234m 567p 456s 78s 22p' },
  { name: 'Ippatsu', en: 'One shot', han: '1', note: 'Win within one uninterrupted turn of declaring riichi.' },
  { name: 'Iipeikou', en: 'Pure double run', han: '1', note: 'Two identical runs.', ex: '334455m 678p 999s 22z' },
  { name: 'Chiitoitsu', en: 'Seven pairs', han: '2', note: 'Seven different pairs. Always 25 fu.', ex: '11m 44m 77p 22s 55s 33z 66z' },
  { name: 'Double riichi', en: 'Double ready', han: '2', note: 'Riichi on your first discard with no calls before it.' },
  { name: 'Ryanpeikou', en: 'Twice pure double run', han: '3', note: 'Two sets of identical runs.', ex: '223344m 667788p 55s' },
];
const OPEN_YAKU = [
  { name: 'Yakuhai', en: 'Value triplet', han: '1 each', note: 'A triplet of a dragon, your seat wind or the round wind (a wind that is both counts twice).', ex: '555z 123m 456p 789s 22s' },
  { name: 'Tanyao', en: 'All simples', han: '1', note: 'Only simples (2–8). Open tanyao can be turned off.', ex: '234m 567p 345s 666s 88p' },
  { name: 'Haitei raoyue', en: 'Last tile from the wall', han: '1', note: 'Tsumo on the last live tile.' },
  { name: 'Houtei raoyui', en: 'Last discard', han: '1', note: 'Ron on the last discard of the hand.' },
  { name: 'Rinshan kaihou', en: 'After a kan', han: '1', note: 'Win on the replacement tile after a kan.' },
  { name: 'Chankan', en: 'Robbing a kan', han: '1', note: 'Ron on the tile someone adds to a pon (added kan).' },
  { name: 'Toitoi', en: 'All triplets', han: '2', note: 'Four triplets (or kans).', ex: '111m 444p 777s 222z 99s' },
  { name: 'Sanshoku doujun', en: 'Mixed triple run', han: '2 · open 1', note: 'The same run in all three suits.', ex: '345m 345p 345s 777z 22m' },
  { name: 'Ittsu', en: 'Pure straight', han: '2 · open 1', note: '1–2–3, 4–5–6, 7–8–9 of one suit.', ex: '123456789m 444p 22s' },
  { name: 'Chanta', en: 'Outside hand', han: '2 · open 1', note: 'Every set and the pair contain a terminal or honor, with at least one run.', ex: '123m 789p 111z 999s 11p' },
  { name: 'Sanankou', en: 'Three concealed triplets', han: '2', note: 'Three closed triplets (a triplet completed by ron does not count).', ex: '111m 444p 777s 23s 99s' },
  { name: 'Shousangen', en: 'Little three dragons', han: '2', note: 'Two dragon triplets and a pair of the third.', ex: '555z 666z 77z 123m 456s' },
  { name: 'Honroutou', en: 'All terminals and honors', han: '2', note: 'Only terminals and honors (so also toitoi or chiitoitsu).', ex: '111m 999p 111z 777z 99s' },
  { name: 'Sanshoku doukou', en: 'Triple triplets', han: '2', note: 'The same triplet in all three suits.', ex: '222m 222p 222s 456m 99p' },
  { name: 'Sankantsu', en: 'Three kans', han: '2', note: 'Three kans.' },
  { name: 'Honitsu', en: 'Half flush', han: '3 · open 2', note: 'One suit plus honors.', ex: '123m 666m 999m 111z 55z' },
  { name: 'Junchan', en: 'Fully outside hand', han: '3 · open 2', note: 'Every set and the pair contain a terminal, no honors.', ex: '123m 789p 111s 789s 99m' },
  { name: 'Chinitsu', en: 'Full flush', han: '6 · open 5', note: 'All one suit, no honors.', ex: '123m 456m 678m 999m 22m' },
];

const YAKUMAN = [
  { name: 'Daisangen', en: 'Big three dragons', note: 'All three dragon triplets.', ex: '555z 666z 777z 123m 99p' },
  { name: 'Suuankou', en: 'Four concealed triplets', note: 'Four closed triplets (single wait: double).', ex: '111m 444p 777s 222z 99s' },
  { name: 'Kokushi musou', en: 'Thirteen orphans', note: 'Thirteen orphans: every terminal and honor once, one of them twice. 13-sided wait: double.', ex: '19m 19p 19s 1234567z 1z' },
  { name: 'Shousuushii', en: 'Little four winds', note: 'Three wind triplets and a pair of the fourth.', ex: '111z 222z 333z 44z 567p' },
  { name: 'Daisuushii', en: 'Big four winds', note: 'All four wind triplets (double yakuman).', ex: '111z 222z 333z 444z 55p' },
  { name: 'Tsuuiisou', en: 'All honors', note: 'All honors.', ex: '111z 333z 555z 666z 77z' },
  { name: 'Chinroutou', en: 'All terminals', note: 'All terminals.', ex: '111m 999m 111p 999s 99p' },
  { name: 'Ryuuiisou', en: 'All green', note: 'All green: 2, 3, 4, 6, 8 of bamboo and 發.', ex: '234s 666s 888s 666z 22s' },
  { name: 'Chuuren poutou', en: 'Nine gates', note: '1112345678999 of one suit plus any tile of it (nine-sided wait: double).', ex: '1112345678999m 5m' },
  { name: 'Suukantsu', en: 'Four kans', note: 'Four kans.' },
  { name: 'Tenhou', en: 'Heavenly hand', note: 'Dealer wins on the first draw.' },
  { name: 'Chiihou', en: 'Earthly hand', note: 'Non-dealer wins on their first draw with no calls before it.' },
];

/** Stable id for a yaku from its display name: "Yakuhai: Round Wind" → "yakuhai", "Menzen Tsumo" → "menzentsumo". */
export function yakuSlug(name) { return String(name).toLowerCase().split(/[:(]/)[0].replace(/[^a-z]/g, ''); }

export function yakuHtml() {
  const row = (y) => `<div class="yrow" id="y-${yakuSlug(y.name)}"><div class="yhead"><b>${y.name}${y.en ? ` <span class="en">· ${y.en}</span>` : ''}</b><span class="han">${y.han || 'Yakuman'}</span></div><div class="ynote">${y.note}</div>${y.ex ? tiles(y.ex) : ''}</div>`;
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

export function tilesHtml() {
  const row = (label, kinds, red) => `<div class="trow"><span class="tlabel">${label}</span><span class="ex">${kinds.map((k) => kindHtml(k)).join('')}${red != null ? tileHtml(red * 4, { classes: ['redfive'], title: 'Red five' }) : ''}</span></div>`;
  const nums = (base) => Array.from({ length: 9 }, (_, i) => base + i);
  const named = (label, items) => `<div class="trow"><span class="tlabel">${label}</span><span class="ex named">${items.map(([k, romaji, en]) => `<span class="nt">${kindHtml(k)}<b>${romaji}</b><small>${en}</small></span>`).join('')}</span></div>`;
  return `
<h2>Tiles and table pieces</h2>
<nav class="toc"><a href="#t-suits">Suits</a><a href="#t-honors">Honors</a><a href="#t-pieces">Table pieces</a><a href="#t-sticks">Point sticks</a></nav>
<p class="note">136 tiles: four of each. The small numeral in the corner is the tile's number; three fives (one per suit) are red and count as dora.</p>
<h3 id="t-suits">Suits</h3>
${row('Characters · 萬 (man)', nums(0), 4)}
${row('Circles · 筒 (pin)', nums(9), 13)}
${row('Bamboo · 索 (sou)', nums(18), 22)}
<h3 id="t-honors">Honors</h3>
${named('Winds', [[27, 'ton', 'East'], [28, 'nan', 'South'], [29, 'shaa', 'West'], [30, 'pei', 'North']])}
${named('Dragons', [[31, 'haku', 'white dragon'], [32, 'hatsu', 'green dragon'], [33, 'chun', 'red dragon']])}
<p class="note">A triplet of any dragon, of the round wind or of your seat wind is a <a href="#yaku" class="rule-link" data-yaku="1" title="Open the yaku reference">yakuhai</a> — one han, open or closed. The corner letters are E S W N for the winds and Wh Gr Rd for the dragons.</p>
<div class="trow"><span class="tlabel">Back</span><span class="ex">${tileHtml(null, { faceDown: true })}</span></div>
<h3 id="t-pieces">Table pieces</h3>
<div class="pieces">
  <div class="piece"><div class="compass-demo">${compassSvg({ dealerRel: 0, diceSum: 7 })}</div><div><b>Wind compass</b><br>Sits in the middle of the table. Each lobe shows that seat's wind (the dealer's is red). The numbers on each edge are the dice totals that break that player's wall; the rolled one is tinted. The slots hold riichi sticks.</div></div>
  <div class="piece"><div class="plaque-demo">${plaqueSvg(0)}</div><div><b>Round plaque</b><br>Shows the round wind (東 for the East round, 南 for South) beside the compass.</div></div>
  <div class="piece"><div class="dice-demo">${diceSvg(3)}${diceSvg(4)}</div><div><b>Dice</b><br>The dealer rolls to start each hand; the total picks the wall that is broken for the deal.</div></div>
</div>
<h3 id="t-sticks">Point sticks</h3>
<div class="sticks-demo">
  <div class="srow">${stickSvg(10000)}<b>10 000</b><span>yellow with red marks</span></div>
  <div class="srow">${stickSvg(5000)}<b>5 000</b><span>vermilion, five dots</span></div>
  <div class="srow">${stickSvg(1000)}<b>1 000</b><span>blue, one dot — the riichi stick</span></div>
  <div class="srow">${stickSvg(500)}<b>500</b><span>teal, eight dots</span></div>
  <div class="srow">${stickSvg(100)}<b>100</b><span>white, eight dots — the honba counter</span></div>
</div>
<p class="note">Everyone starts with 25 000 (2 × 10 000 + 1 × 5 000). Scores are shown as sticks on the result screen.</p>`;
}
