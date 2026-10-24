// Chain Snake for the brAIn.gAIn game runtime (Frontend docs/game-authoring.md, protocol v2).
// The player steers a snake and eats the steps of a sequence in the right order; decoys
// (later steps, or items that don't belong) cost a heart. All content comes from api.data,
// generated per round from the player's study material and validated against config.json.
// Arrow keys steer and Space continues. On touch screens, tapping the left/right half turns
// left/right and any tap continues: the runtime only forwards keys, so the game listens for
// pointer events on its own canvas.

// ------------------------------------------------------------------ constants
const P = {
  black: '#000000',
  navy: '#1d2b53',
  plum: '#7e2553',
  moss: '#008751',
  brown: '#ab5236',
  slate: '#5f574f',
  silver: '#c2c3c7',
  white: '#fff1e8',
  red: '#ff004d',
  orange: '#ffa300',
  yellow: '#ffec27',
  green: '#00e436',
  blue: '#29adff',
  lavender: '#83769c',
  pink: '#ff77a8',
  peach: '#ffccaa',
}; // PICO-8 palette

const ROUND_SECONDS = 60;
const HEARTS = 3;
const START_LENGTH = 4;
const MAX_QUEUED_TURNS = 2;
const CARD_DELAY = 0.5; // ignore presses right after a card opens
const WAIT_CHAIN = 1.4; // the snake waits this long before a chain starts
const WAIT_RESPAWN = 0.9;
const MAX_ITEMS = 60;
const LABEL_CHARS = 12;
const TITLE_MAX = 40;
const STEP_MAX = 24;

const UP = { x: 0, y: -1 };
const DOWN = { x: 0, y: 1 };
const LEFT = { x: -1, y: 0 };
const RIGHT = { x: 1, y: 0 };
const KEY_DIRS = { ArrowUp: UP, ArrowDown: DOWN, ArrowLeft: LEFT, ArrowRight: RIGHT };

// 5x7 bitmap font, printable ASCII (32..126) in order: 7 rows of 5 bits each, as hex.
// Characters outside it (accents, symbols, other scripts) fall back to the canvas font.
// FONT_DESCENDERS replaces a few lowercase letters with 8-row versions that drop below the line.
const FONT_ASCII = (
  '00000000000000 04040404040004 0a0a0000000000 0a0a1f0a1f0a0a 040f140e051e04 18190204081303 ' +
  '0c12140815120d 04040000000000 02040808080402 08040202020408 0004150e150400 0004041f040400 ' +
  '000000000c0408 0000001f000000 00000000000c0c 00010204081000 0e11131519110e 040c040404040e ' +
  '0e11010204081f 1f02040201110e 02060a121f0202 1f101e0101110e 0608101e11110e 1f010204080808 ' +
  '0e11110e11110e 0e11110f01020c 000c0c000c0c00 000c0c000c0408 02040810080402 00001f001f0000 ' +
  '08040201020408 0e110102040004 0e11010d15150e 0e1111111f1111 1e11111e11111e 0e11101010110e ' +
  '1c12111111121c 1f10101e10101f 1f10101e101010 0e11101711110f 1111111f111111 0e04040404040e ' +
  '0702020202120c 11121418141211 1010101010101f 111b1515111111 11111915131111 0e11111111110e ' +
  '1e11111e101010 0e11111115120d 1e11111e141211 0f10100e01011e 1f040404040404 1111111111110e ' +
  '11111111110a04 1111111515150a 11110a040a1111 1111110a040404 1f01020408101f 0e08080808080e ' +
  '00100804020100 0e02020202020e 040a1100000000 0000000000001f 08040000000000 00000e010f110f ' +
  '1010161911111e 00000e1010110e 01010d1311110f 00000e111f100e 0609081c080808 00000f110f010e ' +
  '10101619111111 04000c0404040e 0200060202120c 10101214181412 0c04040404040e 00001a15151111 ' +
  '00001619111111 00000e1111110e 00001e111e1010 00000d130f0101 00001619101010 00000e100e011e ' +
  '08081c08080906 0000111111130d 00001111110a04 0000111115150a 0000110a040a11 000011110f010e ' +
  '00001f0204081f 02040408040402 04040404040404 08040402040408 00000815020000'
).split(' ');
const FONT_DESCENDERS = {
  g: '00000f11110f010e',
  j: '020006020202120c',
  p: '00001e11111e1010',
  q: '00000f11110f0101',
  y: '00001111110f010e',
};
const FONT_EXTRA = {
  ä: '0a000e010f110f',
  ö: '0a000e1111110e',
  ü: '0a00111111130d',
  Ä: '0a0e11111f1111',
  Ö: '0a0e111111110e',
  Ü: '0a00111111110e',
  ß: '0c12121c12121c',
  é: '02040e111f100e',
};
const HEART = [0x36, 0x7f, 0x7f, 0x3e, 0x1c, 0x08]; // 7 bits wide

// ------------------------------------------------------------------ state
let api, W, H, canvasEl;
let px, charW, lineH, pad, hudH, cell, cols, rows, bx, by;
let chains = [];
let phase = 'intro'; // intro | play | card | end | empty
let chainIndex = 0;
let stepIndex = 0;
let snake = [];
let dir = UP;
let turns = [];
let grow = 0;
let moveT = 0;
let waitT = 0;
let waitKind = 'chain';
let foods = [];
let hearts = HEARTS;
let timeLeft = ROUND_SECONDS;
let score = 0;
let combo = 0;
let chainsDone = 0;
let mistakes = 0;
let items = [];
let endReason = '';
let submitted = false;
let cardT = 0;
let t = 0;
let shake = 0;
let flash = 0;
let particles = [];
let floats = [];
let taps = [];
let prevKeys = {};
const textCache = new Map();

// ------------------------------------------------------------------ data
function clean(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// Drop chains the schema cannot rule out but the game cannot play: fewer than two steps, or
// duplicate steps (the order would be ambiguous). Decoys must not equal a step.
function loadChains(data) {
  const result = [];
  for (const chain of Array.isArray(data.chains) ? data.chains.slice(0, 3) : []) {
    if (chain === null || typeof chain !== 'object') continue;
    const steps = (Array.isArray(chain.steps) ? chain.steps.slice(0, 6) : [])
      .map((s) => clean(s, STEP_MAX))
      .filter(Boolean);
    const keys = steps.map((s) => s.toLowerCase());
    if (steps.length < 2 || new Set(keys).size !== keys.length) continue;
    const decoys = [];
    for (const d of Array.isArray(chain.decoys) ? chain.decoys.slice(0, 3) : []) {
      const text = clean(d, STEP_MAX);
      if (text && !keys.includes(text.toLowerCase()) && !decoys.includes(text)) decoys.push(text);
    }
    const title = clean(chain.title, TITLE_MAX) || `Chain ${result.length + 1}`;
    result.push({ title, steps, decoys });
  }
  return result;
}

// ------------------------------------------------------------------ helpers
function pressed(input, key) {
  const state = input.keys[key];
  if (state && typeof state === 'object') return Boolean(state.justPressed);
  return Boolean(state && !prevKeys[key]);
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function wrap(text, maxChars, maxLines = Infinity) {
  const lines = [];
  let line = '';
  for (let word of String(text).split(' ')) {
    while (Array.from(word).length > maxChars) {
      if (line) lines.push(line);
      line = '';
      lines.push(Array.from(word).slice(0, maxChars).join(''));
      word = Array.from(word).slice(maxChars).join('');
    }
    const next = line ? `${line} ${word}` : word;
    if (Array.from(next).length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = fit(`${lines[maxLines - 1]}..`, maxChars);
  }
  return lines;
}

function fit(text, maxChars) {
  const chars = Array.from(text);
  return chars.length <= maxChars
    ? text
    : `${chars.slice(0, Math.max(0, maxChars - 2)).join('')}..`;
}

function overlaps(a, b, margin) {
  return (
    a.x < b.x + b.w + margin &&
    b.x < a.x + a.w + margin &&
    a.y < b.y + b.h + margin &&
    b.y < a.y + a.h + margin
  );
}

// ------------------------------------------------------------------ text
function glyph(ch) {
  const code = ch.codePointAt(0);
  const hex =
    FONT_DESCENDERS[ch] || (code >= 32 && code <= 126 ? FONT_ASCII[code - 32] : FONT_EXTRA[ch]);
  if (!hex) return null;
  const rowsOut = [];
  for (let i = 0; i < hex.length / 2; i++) rowsOut.push(parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return rowsOut;
}

function textW(text, scale = px) {
  return Math.max(0, Array.from(text).length * 6 * scale - scale);
}

// Each distinct (text, color, scale) is rasterised once into a small canvas.
function textImage(text, color, scale) {
  const key = `${scale}|${color}|${text}`;
  let image = textCache.get(key);
  if (image) return image;
  if (textCache.size > 400) textCache.clear();
  const chars = Array.from(text);
  image = document.createElement('canvas');
  image.width = Math.max(1, chars.length * 6 * scale);
  image.height = 8 * scale;
  const g = image.getContext('2d');
  g.fillStyle = color;
  chars.forEach((ch, i) => {
    const ox = i * 6 * scale;
    const bits = glyph(ch);
    if (bits) {
      for (let r = 0; r < bits.length; r++) {
        for (let c = 0; c < 5; c++) {
          if (bits[r] & (16 >> c)) g.fillRect(ox + c * scale, r * scale, scale, scale);
        }
      }
    } else if (ch !== ' ') {
      g.font = `bold ${8 * scale}px monospace`;
      g.textBaseline = 'top';
      g.fillText(ch, ox, 0, 5 * scale);
    }
  });
  textCache.set(key, image);
  return image;
}

function drawText(ctx, text, x, y, color, scale = px, align = 'left') {
  if (!text) return;
  const w = textW(text, scale);
  const dx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.drawImage(textImage(text, color, scale), Math.round(dx), Math.round(y));
}

function drawSprite(ctx, bits, width, x, y, color, scale = px) {
  ctx.fillStyle = color;
  bits.forEach((row, r) => {
    for (let c = 0; c < width; c++) {
      if (row & (1 << (width - 1 - c))) ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  });
}

// ------------------------------------------------------------------ layout
function layout() {
  px = Math.max(1, Math.floor(Math.min(W, H) / 180));
  charW = 6 * px;
  lineH = 9 * px;
  pad = 4 * px;
  hudH = pad + lineH * 3 + pad;
  const availW = W - pad * 2;
  const availH = H - hudH - pad;
  cell = Math.max(6, Math.floor(Math.min(availW / 12, availH / 12)));
  cols = Math.max(6, Math.floor(availW / cell));
  rows = Math.max(6, Math.floor(availH / cell));
  bx = Math.floor((W - cols * cell) / 2);
  by = hudH;
}

function cellRect(x, y) {
  return { x: bx + x * cell, y: by + y * cell, w: cell, h: cell };
}

function labelBox(lines, x, y) {
  const lp = px * 2;
  const w = Math.max(...lines.map((l) => textW(l))) + lp * 2;
  const h = lines.length * lineH - 2 * px + lp * 2;
  const c = cellRect(x, y);
  const left = Math.max(bx, Math.min(bx + cols * cell - w, Math.round(c.x + cell / 2 - w / 2)));
  let top = c.y - h - px * 2;
  let above = true;
  if (top < by) {
    top = c.y + cell + px * 2;
    above = false;
  }
  return { x: left, y: top, w, h, above };
}

// ------------------------------------------------------------------ game flow
function startChain(index) {
  chainIndex = index;
  stepIndex = 0;
  foods = [];
  resetSnake();
  spawnFoods();
  waitT = WAIT_CHAIN;
  waitKind = 'chain';
}

function resetSnake() {
  const cx = Math.floor(cols / 2);
  const cy = Math.min(rows - START_LENGTH, Math.floor(rows / 2));
  snake = [];
  for (let i = 0; i < START_LENGTH; i++) snake.push({ x: cx, y: cy + i });
  dir = UP;
  turns = [];
  grow = 0;
  moveT = 0;
  for (const food of foods) if (snakeAt(food.x, food.y)) placeFood(food);
}

// The next step plus decoys: later steps of the same chain (eating them is "out of order")
// and the chain's own decoys. All foods look alike, so only the labels tell them apart.
function spawnFoods() {
  const chain = chains[chainIndex];
  const candidates = shuffle([...chain.steps.slice(stepIndex + 1), ...chain.decoys]);
  const count = Math.min(chainIndex === 0 ? 1 : 2, candidates.length);
  foods = [];
  const next = [{ text: chain.steps[stepIndex], target: true }];
  for (const text of candidates.slice(0, count)) next.push({ text, target: false });
  for (const food of next) {
    food.lines = wrap(food.text, LABEL_CHARS, 3);
    food.phase = Math.random() * Math.PI * 2;
    placeFood(food);
    foods.push(food);
  }
}

function snakeAt(x, y) {
  return snake.some((s) => s.x === x && s.y === y);
}

// Picks a free cell away from the head whose label overlaps no other food or label. Falls
// back to any free cell when the board is too crowded for that.
function placeFood(food) {
  const others = foods.filter((f) => f !== food && f.x >= 0);
  const free = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!snakeAt(x, y) && !others.some((o) => o.x === x && o.y === y)) free.push({ x, y });
    }
  }
  shuffle(free);
  const head = snake[0] || { x: -99, y: -99 };
  const margin = px * 2;
  const roomy = (c) => {
    if (Math.abs(c.x - head.x) + Math.abs(c.y - head.y) < 4) return false;
    const box = labelBox(food.lines, c.x, c.y);
    const own = cellRect(c.x, c.y);
    return others.every((o) => {
      const ob = labelBox(o.lines, o.x, o.y);
      const oc = cellRect(o.x, o.y);
      return (
        Math.abs(o.x - c.x) + Math.abs(o.y - c.y) >= 3 &&
        !overlaps(box, ob, margin) &&
        !overlaps(box, oc, margin) &&
        !overlaps(own, ob, margin)
      );
    });
  };
  const spot = free.find(roomy) || free[0] || { x: -1, y: -1 };
  food.x = spot.x;
  food.y = spot.y;
}

function queueTurn(next) {
  const last = turns.length ? turns[turns.length - 1] : dir;
  if (next.x === last.x && next.y === last.y) return;
  if (next.x === -last.x && next.y === -last.y) return;
  if (turns.length < MAX_QUEUED_TURNS) turns.push(next);
}

function relativeTurn(side) {
  const last = turns.length ? turns[turns.length - 1] : dir;
  queueTurn(side === 'left' ? { x: last.y, y: -last.x } : { x: -last.y, y: last.x });
}

function stepTime() {
  return Math.max(0.08, 0.17 - chainIndex * 0.025 - stepIndex * 0.006);
}

function step() {
  if (turns.length) dir = turns.shift();
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) return crash();
  const body = grow > 0 ? snake : snake.slice(0, -1);
  if (body.some((s) => s.x === head.x && s.y === head.y)) return crash();
  snake.unshift(head);
  if (grow > 0) grow -= 1;
  else snake.pop();
  const food = foods.find((f) => f.x === head.x && f.y === head.y);
  if (food) bite(food);
}

function bite(food) {
  const chain = chains[chainIndex];
  const c = cellRect(food.x, food.y);
  const cx = c.x + cell / 2;
  const cy = c.y + cell / 2;
  if (items.length < MAX_ITEMS) {
    items.push({ chain: chain.title, step: stepIndex, text: food.text, correct: food.target });
  }
  if (food.target) {
    combo = Math.min(4, combo + 1);
    const points = 100 * combo;
    score += points;
    grow += 2;
    stepIndex += 1;
    burst(cx, cy, [P.green, P.yellow, P.white], 18);
    floatText(combo > 1 ? `+${points} x${combo}` : `+${points}`, cx, cy, P.yellow);
    if (stepIndex >= chain.steps.length) {
      score += 250;
      chainsDone += 1;
      foods = [];
      phase = 'card';
      cardT = 0;
    } else {
      spawnFoods();
    }
    return;
  }
  mistakes += 1;
  combo = 0;
  const later = chain.steps.indexOf(food.text);
  floatText(later >= 0 ? `THAT'S STEP ${later + 1}` : 'NOT IN CHAIN', cx, cy, P.red);
  hurt(cx, cy);
  if (phase !== 'play') return;
  snake.length = Math.max(2, snake.length - 2);
  grow = 0;
  placeFood(food);
}

function crash() {
  const c = cellRect(snake[0].x, snake[0].y);
  combo = 0;
  floatText('CRASH', c.x + cell / 2, c.y + cell / 2, P.red);
  hurt(c.x + cell / 2, c.y + cell / 2);
  if (phase !== 'play') return;
  resetSnake();
  waitT = WAIT_RESPAWN;
  waitKind = 'respawn';
}

function hurt(x, y) {
  hearts -= 1;
  shake = 0.35;
  flash = 0.3;
  burst(x, y, [P.red, P.orange, P.plum], 22);
  if (hearts <= 0) endGame('OUT OF HEARTS');
}

function nextCard() {
  if (chainIndex + 1 < chains.length) {
    startChain(chainIndex + 1);
    phase = 'play';
  } else {
    endGame('ALL CHAINS DONE');
  }
}

function endGame(reason) {
  if (phase === 'end') return;
  phase = 'end';
  endReason = reason;
  cardT = 0;
  if (chainsDone === chains.length) score += Math.round(timeLeft) * 10 + hearts * 100;
  submit();
}

function submit() {
  if (submitted) return;
  submitted = true;
  api.submitResult({
    score,
    completed: chains.length > 0 && chainsDone === chains.length,
    chainsDone,
    totalChains: chains.length,
    mistakes,
    items,
  });
}

// ------------------------------------------------------------------ effects
function burst(x, y, colors, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (40 + Math.random() * 120) * px;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 40 * px,
      life: 0.4 + Math.random() * 0.4,
      color: colors[i % colors.length],
    });
  }
}

function floatText(text, x, y, color) {
  floats.push({ text, x, y, t: 0, color });
}

function updateEffects(dt) {
  shake = Math.max(0, shake - dt);
  flash = Math.max(0, flash - dt);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * px * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const f of floats) f.t += dt;
  floats = floats.filter((f) => f.t < 1);
}

// ------------------------------------------------------------------ lifecycle
function onPointerDown(event) {
  const r = canvasEl.getBoundingClientRect();
  taps.push(event.clientX - r.left < r.width / 2 ? 'left' : 'right');
  if (taps.length > 4) taps.shift();
  event.preventDefault();
}

function init(gameApi) {
  api = gameApi;
  W = api.width;
  H = api.height;
  layout();
  chains = loadChains(api.data);
  const context = clean(api.data.context, 120) || 'Chain Snake';
  api.setUiDesign({
    theme: { accent: 'teal', panel: 'dark', density: 'compact' },
    pauseMenu: { title: 'Snake paused', message: context, resumeLabel: 'Continue' },
    leaderboard: { title: 'Chain Snake', subtitle: context, scoreLabel: 'Points' },
  });
  canvasEl = document.getElementById('c');
  if (canvasEl) {
    canvasEl.style.touchAction = 'none';
    canvasEl.addEventListener('pointerdown', onPointerDown);
  }
  if (chains.length === 0) {
    phase = 'empty';
    submit();
    return;
  }
  startChain(0);
  phase = 'intro';
}

function update(dt, input) {
  t += dt;
  const tapped = taps;
  taps = [];
  const action = pressed(input, 'Space') || tapped.length > 0;
  updateEffects(dt);

  if (phase === 'intro' && action) {
    phase = 'play';
  } else if (phase === 'card') {
    cardT += dt;
    if (action && cardT >= CARD_DELAY) nextCard();
  } else if (phase === 'play') {
    for (const [key, d] of Object.entries(KEY_DIRS)) if (pressed(input, key)) queueTurn(d);
    for (const side of tapped) relativeTurn(side);
    if (waitT > 0) {
      waitT -= dt;
    } else {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        endGame('TIME UP');
      }
      moveT += dt;
      while (phase === 'play' && waitT <= 0 && moveT >= stepTime()) {
        moveT -= stepTime();
        step();
      }
    }
  } else if (phase === 'end') {
    cardT += dt;
  }
  prevKeys = { ...input.keys };
}

function resize(width, height, viewport) {
  W = width;
  H = height;
  const oldCols = cols;
  const oldRows = rows;
  layout();
  if ((cols !== oldCols || rows !== oldRows) && chains.length && phase !== 'end') {
    resetSnake();
    for (const food of foods) placeFood(food);
  }
}

function destroy() {
  if (canvasEl) canvasEl.removeEventListener('pointerdown', onPointerDown);
}

// ------------------------------------------------------------------ rendering
function render(ctx) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = P.black;
  ctx.fillRect(0, 0, W, H);

  if (phase === 'empty') {
    drawCard(ctx, 'NO CHAINS', P.orange, [
      { text: 'This round had no playable sequences.', color: P.silver },
    ]);
    drawScanlines(ctx);
    return;
  }

  ctx.save();
  if (shake > 0) {
    const m = Math.round(px * 3 * Math.min(1, shake / 0.35));
    ctx.translate(Math.round((Math.random() * 2 - 1) * m), Math.round((Math.random() * 2 - 1) * m));
  }
  drawHud(ctx);
  drawBoard(ctx);
  drawEffects(ctx);
  ctx.restore();

  if (phase === 'intro') drawIntro(ctx);
  else if (phase === 'card') drawChainCard(ctx);
  else if (phase === 'end') drawEnd(ctx);
  else if (waitT > 0) drawBanner(ctx);
  drawScanlines(ctx);
}

function drawHud(ctx) {
  const chain = chains[chainIndex];
  let y = pad;
  const heartsW = HEARTS * 8 * px;
  const titleChars = Math.floor((W - pad * 3 - heartsW) / charW);
  drawText(ctx, fit(chain.title.toUpperCase(), titleChars), pad, y, P.yellow);
  for (let i = 0; i < HEARTS; i++) {
    const x = W - pad - heartsW + i * 8 * px;
    drawSprite(ctx, HEART, 7, x, y, i < hearts ? P.red : P.slate);
  }

  y += lineH;
  drawText(ctx, `SCORE ${score}`, pad, y, P.white);
  if (combo > 1) drawText(ctx, `x${combo}`, pad + textW(`SCORE ${score}`) + charW * 2, y, P.orange);
  const secs = Math.ceil(timeLeft);
  drawText(ctx, `${secs}s`, W - pad, y, secs <= 10 ? P.red : P.blue, px, 'right');

  y += lineH;
  const label = `STEP ${Math.min(stepIndex + 1, chain.steps.length)}/${chain.steps.length}`;
  drawText(ctx, label, pad, y, P.lavender);
  let x = pad + textW(label) + charW;
  const box = 5 * px;
  chain.steps.forEach((_, i) => {
    if (i < stepIndex) {
      ctx.fillStyle = P.green;
      ctx.fillRect(x, y + px, box, box);
    } else {
      ctx.fillStyle = i === stepIndex && Math.floor(t * 4) % 2 ? P.white : P.slate;
      ctx.fillRect(x, y + px, box, px);
      ctx.fillRect(x, y + px * 5, box, px);
      ctx.fillRect(x, y + px, px, box);
      ctx.fillRect(x + box - px, y + px, px, box);
    }
    x += box + px * 2;
  });
  if (stepIndex > 0) {
    const last = chain.steps[stepIndex - 1];
    const room = Math.floor((W - pad - x - charW) / charW);
    if (room > 3) drawText(ctx, fit(`> ${last}`, room), x + charW, y, P.green);
  }

  ctx.fillStyle = P.navy;
  ctx.fillRect(0, hudH - pad / 2 - px, W, px);
  ctx.fillStyle = timeLeft <= 10 ? P.red : P.blue;
  ctx.fillRect(0, hudH - pad / 2 - px, Math.round((W * timeLeft) / ROUND_SECONDS), px);
}

function drawBoard(ctx) {
  const w = cols * cell;
  const h = rows * cell;
  ctx.fillStyle = flash > 0 ? P.red : P.blue;
  ctx.fillRect(bx - px * 2, by - px * 2, w + px * 4, h + px * 4);
  ctx.fillStyle = P.navy;
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = '#16224a';
  for (let y = 0; y < rows; y++) {
    for (let x = y % 2; x < cols; x += 2) ctx.fillRect(bx + x * cell, by + y * cell, cell, cell);
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 0, 77, ${flash})`;
    ctx.fillRect(bx, by, w, h);
  }

  for (const food of foods) if (food.x >= 0) drawFood(ctx, food);
  drawSnake(ctx);
  for (const food of foods) if (food.x >= 0) drawLabel(ctx, food);
}

function drawFood(ctx, food) {
  const c = cellRect(food.x, food.y);
  const i = Math.max(px, Math.floor(cell / 6));
  const s = cell - i * 2;
  ctx.fillStyle = P.brown;
  ctx.fillRect(c.x + i, c.y + i, s, s);
  ctx.fillStyle = P.orange;
  ctx.fillRect(c.x + i, c.y + i, s - px, s - px);
  ctx.fillStyle = P.peach;
  ctx.fillRect(c.x + i + px, c.y + i + px, Math.max(px, s / 3), px);
  ctx.fillRect(c.x + i + px, c.y + i + px, px, Math.max(px, s / 3));
}

function drawLabel(ctx, food) {
  const box = labelBox(food.lines, food.x, food.y);
  const bob = Math.round(Math.sin(t * 3 + food.phase) * px);
  const y = box.y + bob;
  const c = cellRect(food.x, food.y);
  ctx.fillStyle = P.lavender;
  const stemX = Math.round(c.x + cell / 2 - px / 2);
  if (box.above) ctx.fillRect(stemX, y + box.h, px, c.y - (y + box.h) + px);
  else ctx.fillRect(stemX, c.y + cell - px, px, y - (c.y + cell) + px * 2);
  ctx.fillRect(box.x - px, y - px, box.w + px * 2, box.h + px * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
  ctx.fillRect(box.x, y, box.w, box.h);
  food.lines.forEach((line, i) => {
    drawText(ctx, line, box.x + box.w / 2, y + px * 2 + i * lineH, P.white, px, 'center');
  });
}

function drawSnake(ctx) {
  if (phase === 'play' && waitT > 0 && waitKind === 'respawn' && Math.floor(t * 10) % 2) return;
  const i = Math.max(1, Math.floor(cell / 12));
  for (let n = snake.length - 1; n >= 0; n--) {
    const s = snake[n];
    const c = cellRect(s.x, s.y);
    ctx.fillStyle = P.moss;
    ctx.fillRect(c.x + i, c.y + i, cell - i * 2, cell - i * 2);
    ctx.fillStyle = n === 0 ? P.green : n % 3 === 0 ? '#00c02e' : P.green;
    ctx.fillRect(c.x + i, c.y + i, cell - i * 2 - px, cell - i * 2 - px);
  }
  const head = snake[0];
  if (!head) return;
  const c = cellRect(head.x, head.y);
  const e = Math.max(px * 2, Math.floor(cell / 5));
  const mid = c.x + cell / 2;
  const midY = c.y + cell / 2;
  const fwd = cell / 4;
  const side = cell / 4;
  const eyes = [
    { x: mid + dir.x * fwd - dir.y * side, y: midY + dir.y * fwd + dir.x * side },
    { x: mid + dir.x * fwd + dir.y * side, y: midY + dir.y * fwd - dir.x * side },
  ];
  for (const eye of eyes) {
    const ex = Math.round(eye.x - e / 2);
    const ey = Math.round(eye.y - e / 2);
    ctx.fillStyle = P.white;
    ctx.fillRect(ex, ey, e, e);
    ctx.fillStyle = P.black;
    const pe = Math.max(px, Math.floor(e / 2));
    ctx.fillRect(
      ex + (e - pe) / 2 + (dir.x * (e - pe)) / 2,
      ey + (e - pe) / 2 + (dir.y * (e - pe)) / 2,
      pe,
      pe,
    );
  }
}

function drawEffects(ctx) {
  const size = px * 2;
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size);
  }
  for (const f of floats) {
    const x = Math.max(pad + textW(f.text) / 2, Math.min(W - pad - textW(f.text) / 2, f.x));
    const y = Math.max(by + px, f.y - lineH - f.t * 24 * px);
    if (f.t > 0.7 && Math.floor(f.t * 20) % 2) continue;
    drawText(ctx, f.text, x + px, y + px, P.black, px, 'center');
    drawText(ctx, f.text, x, y, f.color, px, 'center');
  }
}

function drawBanner(ctx) {
  const chain = chains[chainIndex];
  const lines =
    waitKind === 'chain'
      ? [
          { text: `CHAIN ${chainIndex + 1}/${chains.length}`, color: P.lavender },
          ...wrap(chain.title.toUpperCase(), 22).map((text) => ({ text, color: P.yellow })),
          { text: 'GET READY', color: Math.floor(t * 4) % 2 ? P.white : P.silver },
        ]
      : [{ text: 'READY?', color: Math.floor(t * 6) % 2 ? P.white : P.silver }];
  const w = Math.max(...lines.map((l) => textW(l.text))) + pad * 2;
  const h = lines.length * lineH + pad * 2 - px * 2;
  const x = Math.round(W / 2 - w / 2);
  const y = Math.round(by + rows * cell * 0.25);
  ctx.fillStyle = P.blue;
  ctx.fillRect(x - px, y - px, w + px * 2, h + px * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.fillRect(x, y, w, h);
  lines.forEach((l, i) => drawText(ctx, l.text, W / 2, y + pad + i * lineH, l.color, px, 'center'));
}

function drawCard(ctx, title, titleColor, entries, footer) {
  const w = Math.min(W - pad * 2, charW * 40 + pad * 2);
  const maxChars = Math.floor((w - pad * 2) / charW);
  const titleScale = textW(title, px * 2) <= w - pad * 2 ? px * 2 : px;
  const lines = [];
  for (const entry of entries) {
    if (!entry.text) lines.push({ text: '', color: entry.color, gap: true });
    else for (const text of wrap(entry.text, maxChars)) lines.push({ text, color: entry.color });
  }
  const bodyH = lines.reduce((sum, l) => sum + (l.gap ? lineH / 2 : lineH), 0);
  const h = pad * 2 + 7 * titleScale + lineH + bodyH + (footer ? lineH * 1.5 : 0);
  const x = Math.round((W - w) / 2);
  const y = Math.max(pad, Math.round((H - h) / 2));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = P.blue;
  ctx.fillRect(x - px * 2, y - px * 2, w + px * 4, h + px * 4);
  ctx.fillStyle = P.black;
  ctx.fillRect(x - px, y - px, w + px * 2, h + px * 2);
  ctx.fillStyle = P.navy;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.black;
  ctx.fillRect(x + px, y + px, w - px * 2, h - px * 2);

  let cy = y + pad;
  drawText(ctx, title, W / 2, cy, titleColor, titleScale, 'center');
  cy += 7 * titleScale + lineH;
  for (const line of lines) {
    if (line.gap) {
      cy += lineH / 2;
      continue;
    }
    drawText(ctx, line.text, x + pad, cy, line.color);
    cy += lineH;
  }
  if (footer && Math.floor(t * 2.5) % 2 === 0) {
    drawText(ctx, footer, W / 2, cy + lineH / 2, P.green, px, 'center');
  }
}

function drawIntro(ctx) {
  drawCard(
    ctx,
    'CHAIN SNAKE',
    P.green,
    [
      { text: clean(api.data.context, 120), color: P.white },
      { text: '' },
      { text: 'Eat the steps in the right order.', color: P.yellow },
      { text: 'Wrong bite or crash: -1 heart.', color: P.silver },
      { text: '' },
      { text: 'Arrows: steer', color: P.silver },
      { text: 'Tap left/right: turn', color: P.silver },
    ],
    'SPACE OR TAP TO START',
  );
}

function drawChainCard(ctx) {
  const chain = chains[chainIndex];
  const last = chainIndex + 1 >= chains.length;
  drawCard(
    ctx,
    'CHAIN COMPLETE!',
    P.green,
    [
      { text: chain.title, color: P.yellow },
      { text: '' },
      ...chain.steps.map((s, i) => ({ text: `${i + 1}. ${s}`, color: P.white })),
      { text: '' },
      { text: '+250 BONUS', color: P.orange },
    ],
    last ? 'SPACE OR TAP: FINISH' : 'SPACE OR TAP: NEXT',
  );
}

function drawEnd(ctx) {
  const done = chainsDone === chains.length;
  const color = done ? P.green : endReason === 'TIME UP' ? P.orange : P.red;
  const entries = [
    { text: `SCORE ${score}`, color: P.yellow },
    { text: `CHAINS ${chainsDone}/${chains.length}   WRONG BITES ${mistakes}`, color: P.silver },
  ];
  if (!done) {
    const chain = chains[chainIndex];
    entries.push({ text: '' }, { text: `The order was (${chain.title}):`, color: P.lavender });
    chain.steps.forEach((s, i) => {
      entries.push({ text: `${i + 1}. ${s}`, color: i < stepIndex ? P.green : P.white });
    });
  }
  drawCard(ctx, endReason, color, entries);
}

function drawScanlines(ctx) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  const step = Math.max(2, px * 2);
  const line = Math.max(1, Math.floor(px / 2));
  for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, line);
}

registerGame({ init, update, render, resize, destroy });
