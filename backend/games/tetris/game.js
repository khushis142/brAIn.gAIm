// Quiz Tetris for the brAIn.gAIn game runtime (Frontend docs/game-authoring.md, protocol v2).
// A 60-second Tetris sprint. Clearing lines (or 15 seconds without a question) freezes the
// pieces for one multiple-choice question from api.data: a right answer earns bonus points and
// slows the pieces down, a wrong one speeds them up, and the correct answer is shown either way.
// Keyboard: Left/Right move, Up rotates, Down soft-drops, Space hard-drops, Up/Down + Space
// answer. Touch: drag sideways to move, tap to rotate, drag down to soft-drop, flick down to
// hard-drop, tap an option to answer. Touch is read from input.touches directly, because the
// runtime's gesture keys would turn every tap into Space (a hard drop); while fingers are on
// the screen, keys are ignored.

const COLS = 10;
const ROWS = 20;
const ROUND_SECONDS = 60;
const QUESTION_SECONDS = 10;
const FEEDBACK_SECONDS = 1.2;
const IDLE_QUESTION_SECONDS = 15;
const MIN_SECONDS_FOR_QUESTION = 4; // no question when the round is about to end
const LOCK_DELAY = 0.45;
const MAX_LOCK_RESETS = 12;
const DAS = 0.16; // held-key delay before auto-repeat
const ARR = 0.05; // auto-repeat interval
const SOFT_DROP_FACTOR = 18;
const LINES_PER_LEVEL = 5;
const LINE_POINTS = [0, 100, 300, 500, 800];
const CORRECT_BONUS = 250;
const TOUCH_KEY_COOLDOWN = 0.35;
const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

const SHAPES = [
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [1, 1],
    [1, 1],
  ], // O
  [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ], // T
  [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ], // S
  [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ], // Z
  [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ], // L
];
const COLORS = ['#38bdf8', '#facc15', '#a78bfa', '#4ade80', '#f87171', '#60a5fa', '#fb923c'];
// Wall kicks tried in order when a rotation collides.
const KICKS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [-2, 0],
  [2, 0],
  [0, -1],
];

let api = null;
let W = 0;
let H = 0;
let safe = { top: 0, right: 0, bottom: 0, left: 0 };
let reducedEffects = false;
let layout = null; // set by computeLayout() in init and resize

let board = [];
let piece = null; // { type, m, x, y }
let nextType = 0;
let bag = [];
let mode = 'play'; // play | question | feedback | over
let finished = false;
let toppedOut = false;

let clock = 0;
let now = 0;
let score = 0;
let lines = 0;
let level = 1;
let speedScale = 1; // above 1 is slower; changed by answers
let fallTimer = 0;
let lockTimer = 0;
let lockResets = 0;
let sinceQuestion = 0;

let questions = [];
let questionIndex = 0;
let current = null; // { question, options: [{ text, correct }] }
let selected = 0;
let chosen = -1;
let questionTimer = 0;
let feedbackTimer = 0;
let correctCount = 0;
let answeredCount = 0;
let optionRects = [];

let flashes = []; // { row, t }
let prevHeld = {};
let repeat = { ArrowLeft: 0, ArrowRight: 0 };
let keySoft = false;
let touchSoft = false;
let touchCooldown = 0;
let gesture = null; // { id, anchorX, startTime, moved }
let usedKeyboard = false;
let context = '';

function init(gameApi) {
  api = gameApi;
  const viewport = api.viewport || {};
  W = Number(api.width || viewport.width) || 360;
  H = Number(api.height || viewport.height) || 640;
  safe = normalizeSafeArea(viewport.safeArea);
  reducedEffects = Boolean(api.performance && api.performance.reducedEffects);

  const data = api.data && typeof api.data === 'object' ? api.data : {};
  context = typeof data.context === 'string' && data.context.trim() ? data.context.trim() : 'Quiz';
  questions = shuffle(prepareQuestions(data.questions));

  if (typeof api.setUiDesign === 'function') {
    api.setUiDesign({
      theme: { accent: 'sky', panel: 'dark', density: 'compact' },
      pauseMenu: { title: 'Tetris paused', message: context, resumeLabel: 'Keep stacking' },
      leaderboard: { title: 'Quiz Tetris', subtitle: context, scoreLabel: 'Points' },
    });
  }

  board = [];
  for (let r = 0; r < ROWS; r += 1) board.push(new Array(COLS).fill(0));
  nextType = drawFromBag();
  computeLayout();
  spawn();
}

// Keep only questions the game can show correctly: the schema cannot check that `answer`
// points at an existing option or that options are distinct.
function prepareQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const q of raw) {
    if (!q || typeof q !== 'object' || typeof q.question !== 'string') continue;
    if (!q.question.trim() || !Array.isArray(q.options)) continue;
    const texts = q.options.map((o) => (typeof o === 'string' ? o.trim() : ''));
    if (texts.length < 2 || texts.some((t) => !t)) continue;
    if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) continue;
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= texts.length) continue;
    result.push({
      question: q.question.trim(),
      options: texts.map((text, i) => ({ text, correct: i === q.answer })),
    });
  }
  return result;
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function normalizeSafeArea(area) {
  const value = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0);
  return area && typeof area === 'object'
    ? { top: value(area.top), right: value(area.right), bottom: value(area.bottom), left: value(area.left) }
    : { top: 0, right: 0, bottom: 0, left: 0 };
}

// Portrait: HUD above the board. Landscape: HUD left of the board and the next piece right of
// it, so the board gets the full height.
function computeLayout() {
  const pad = Math.max(8, Math.round(Math.min(W, H) * 0.025));
  const left = safe.left + pad;
  const right = W - safe.right - pad;
  const top = safe.top + pad;
  const bottom = H - safe.bottom - pad;
  const hintH = 22;
  const side = W > H * 1.1;
  const hudH = side ? 0 : Math.round(Math.min(84, Math.max(52, H * 0.1)));
  const availW = Math.max(40, right - left);
  const availH = Math.max(80, bottom - top - hudH - hintH);
  const cell = Math.max(6, Math.floor(Math.min(availH / ROWS, availW / COLS)));
  const bw = cell * COLS;
  const bh = cell * ROWS;
  const bx = Math.round(left + (availW - bw) / 2);
  const by = Math.round(top + hudH + (availH - bh) / 2);
  const nextSize = side ? Math.min(72, Math.max(40, right - bx - bw - pad)) : Math.min(hudH - 8, 64);
  layout = {
    pad,
    cell,
    bx,
    by,
    side,
    hud: side
      ? { x: left, y: by, w: Math.max(40, bx - pad - left), h: bh }
      : { x: left, y: top, w: availW - nextSize - 10, h: hudH },
    next: side
      ? { x: bx + bw + pad, y: by, size: nextSize }
      : { x: right - nextSize, y: top + (hudH - nextSize) / 2, size: nextSize },
    hintY: bottom - hintH + 4,
  };
}

// ---- Pieces ----------------------------------------------------------------------------

function drawFromBag() {
  if (bag.length === 0) bag = shuffle([0, 1, 2, 3, 4, 5, 6]);
  return bag.pop();
}

function copyShape(m) {
  return m.map((row) => row.slice());
}

function rotateCW(m) {
  const n = m.length;
  const out = [];
  for (let r = 0; r < n; r += 1) {
    out.push([]);
    for (let c = 0; c < n; c += 1) out[r].push(m[n - 1 - c][r]);
  }
  return out;
}

function collides(m, x, y) {
  for (let r = 0; r < m.length; r += 1) {
    for (let c = 0; c < m[r].length; c += 1) {
      if (!m[r][c]) continue;
      const bx = x + c;
      const by = y + r;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

function spawn() {
  const type = nextType;
  nextType = drawFromBag();
  const m = copyShape(SHAPES[type]);
  let firstRow = 0;
  while (firstRow < m.length && !m[firstRow].some(Boolean)) firstRow += 1;
  piece = { type, m, x: Math.floor((COLS - m.length) / 2), y: -firstRow };
  fallTimer = 0;
  lockTimer = 0;
  lockResets = 0;
  if (collides(piece.m, piece.x, piece.y)) {
    toppedOut = true;
    finish();
  }
}

function tryMove(dx, dy) {
  if (!piece || collides(piece.m, piece.x + dx, piece.y + dy)) return false;
  piece.x += dx;
  piece.y += dy;
  if (dy > 0) lockTimer = 0;
  else resetLock();
  return true;
}

function resetLock() {
  if (lockTimer > 0 && lockResets < MAX_LOCK_RESETS) {
    lockTimer = 0;
    lockResets += 1;
  }
}

function rotate() {
  if (!piece || piece.type === 1) return; // O does not rotate
  const m = rotateCW(piece.m);
  for (const [kx, ky] of KICKS) {
    if (!collides(m, piece.x + kx, piece.y + ky)) {
      piece.m = m;
      piece.x += kx;
      piece.y += ky;
      resetLock();
      return;
    }
  }
}

function dropDistance() {
  let d = 0;
  while (piece && !collides(piece.m, piece.x, piece.y + d + 1)) d += 1;
  return d;
}

function hardDrop() {
  if (!piece) return;
  const d = dropDistance();
  piece.y += d;
  score += 2 * d;
  lockPiece();
}

function lockPiece() {
  let aboveTop = false;
  for (let r = 0; r < piece.m.length; r += 1) {
    for (let c = 0; c < piece.m[r].length; c += 1) {
      if (!piece.m[r][c]) continue;
      const by = piece.y + r;
      if (by < 0) aboveTop = true;
      else board[by][piece.x + c] = piece.type + 1;
    }
  }
  piece = null;
  if (aboveTop) {
    toppedOut = true;
    finish();
    return;
  }

  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    if (board[r].every(Boolean)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      if (!reducedEffects) flashes.push({ row: r + cleared, t: 0.25 });
      cleared += 1;
      r += 1; // re-check the row that moved down into this index
    }
  }
  if (cleared) {
    score += LINE_POINTS[Math.min(cleared, 4)] * level;
    lines += cleared;
    level = 1 + Math.floor(lines / LINES_PER_LEVEL);
  }

  spawn();
  if (!finished && (cleared > 0 || sinceQuestion >= IDLE_QUESTION_SECONDS)) startQuestion();
}

function fallInterval() {
  return Math.max(0.06, 0.8 * Math.pow(0.85, level - 1)) * speedScale;
}

function applyGravity(dt) {
  if (!piece) return;
  const soft = keySoft || touchSoft;
  const interval = fallInterval() / (soft ? SOFT_DROP_FACTOR : 1);
  if (!collides(piece.m, piece.x, piece.y + 1)) {
    fallTimer += dt;
    while (fallTimer >= interval) {
      fallTimer -= interval;
      if (!tryMove(0, 1)) break;
      if (soft) score += 1;
    }
  } else {
    fallTimer = 0;
    lockTimer += dt;
    if (lockTimer >= LOCK_DELAY) lockPiece();
  }
}

// ---- Questions -------------------------------------------------------------------------

function startQuestion() {
  sinceQuestion = 0;
  if (questions.length === 0 || ROUND_SECONDS - clock < MIN_SECONDS_FOR_QUESTION) return;
  const q = questions[questionIndex % questions.length];
  questionIndex += 1;
  current = { question: q.question, options: shuffle(q.options) };
  selected = 0;
  chosen = -1;
  questionTimer = QUESTION_SECONDS;
  mode = 'question';
  gesture = null;
  touchSoft = false;
  keySoft = false;
}

function answer(index) {
  chosen = index;
  answeredCount += 1;
  const right = index >= 0 && current.options[index].correct;
  if (right) {
    correctCount += 1;
    score += CORRECT_BONUS;
    speedScale = Math.min(1.6, speedScale * 1.15);
  } else {
    speedScale = Math.max(0.55, speedScale * 0.85);
  }
  feedbackTimer = FEEDBACK_SECONDS;
  mode = 'feedback';
}

function optionAt(x, y) {
  return optionRects.findIndex((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
}

// ---- Input -----------------------------------------------------------------------------

// Accepts protocol v2 key objects and the older boolean keys.
function keyState(input, name) {
  const state = input && input.keys ? input.keys[name] : undefined;
  if (state && typeof state === 'object') {
    return { held: Boolean(state.held), pressed: Boolean(state.justPressed) };
  }
  const held = Boolean(state);
  return { held, pressed: held && !prevHeld[name] };
}

function rememberKeys(input) {
  for (const name of KEYS) {
    const state = input && input.keys ? input.keys[name] : undefined;
    prevHeld[name] = state && typeof state === 'object' ? Boolean(state.held) : Boolean(state);
  }
}

function touchList(input) {
  const touches = input && input.touches;
  return touches && typeof touches.length === 'number' ? Array.from(touches) : [];
}

function handleRepeat(name, state, dir, dt) {
  if (state.pressed) {
    tryMove(dir, 0);
    repeat[name] = DAS;
  } else if (state.held) {
    repeat[name] -= dt;
    while (repeat[name] <= 0) {
      tryMove(dir, 0);
      repeat[name] += ARR;
    }
  }
}

function playKeys(input, dt) {
  const up = keyState(input, 'ArrowUp');
  const down = keyState(input, 'ArrowDown');
  const left = keyState(input, 'ArrowLeft');
  const right = keyState(input, 'ArrowRight');
  const space = keyState(input, 'Space');
  if (up.pressed || down.held || left.held || right.held || space.pressed) usedKeyboard = true;
  if (up.pressed) rotate();
  if (space.pressed) {
    hardDrop();
    return;
  }
  handleRepeat('ArrowLeft', left, -1, dt);
  handleRepeat('ArrowRight', right, 1, dt);
  keySoft = down.held;
}

function playTouches(touches) {
  const cell = layout.cell;
  let active = null;
  for (const t of touches) {
    if (gesture ? t.id === gesture.id : t.justStarted) {
      active = t;
      break;
    }
  }
  if (!active) {
    gesture = null;
    touchSoft = false;
    return;
  }
  if (!gesture) {
    gesture = { id: active.id, anchorX: active.startX, startTime: now, moved: false };
    usedKeyboard = false;
  }
  const dx = active.x - active.startX;
  const dy = active.y - active.startY;
  if (Math.abs(dx) > cell * 0.4 || Math.abs(dy) > cell * 0.4) gesture.moved = true;

  if (!active.justEnded) {
    const step = cell * 0.85;
    while (active.x - gesture.anchorX >= step) {
      tryMove(1, 0);
      gesture.anchorX += step;
    }
    while (gesture.anchorX - active.x >= step) {
      tryMove(-1, 0);
      gesture.anchorX -= step;
    }
    touchSoft = dy > cell * 1.5 && dy > Math.abs(dx) * 1.5;
    return;
  }
  if (!active.cancelled) {
    const elapsed = now - gesture.startTime;
    if (!gesture.moved && elapsed < 0.35) rotate();
    else if (dy > cell * 2.5 && elapsed < 0.4 && dy > Math.abs(dx) * 1.5) hardDrop();
  }
  gesture = null;
  touchSoft = false;
}

function questionInput(input, touches, useKeys) {
  for (const t of touches) {
    if (!t.justEnded || t.cancelled) continue;
    if (Math.abs(t.x - t.startX) > 24 || Math.abs(t.y - t.startY) > 24) continue;
    const hit = optionAt(t.x, t.y);
    if (hit >= 0) {
      answer(hit);
      return;
    }
  }
  if (!useKeys) return;
  const pointer = input && input.pointer;
  if (pointer && pointer.justPressed) {
    const hit = optionAt(Number(pointer.x), Number(pointer.y));
    if (hit >= 0) {
      answer(hit);
      return;
    }
  }
  const count = current.options.length;
  if (keyState(input, 'ArrowUp').pressed || keyState(input, 'ArrowLeft').pressed) {
    selected = (selected + count - 1) % count;
  }
  if (keyState(input, 'ArrowDown').pressed || keyState(input, 'ArrowRight').pressed) {
    selected = (selected + 1) % count;
  }
  if (keyState(input, 'Space').pressed) answer(selected);
}

// ---- Loop ------------------------------------------------------------------------------

function finish() {
  if (finished) return;
  finished = true;
  mode = 'over';
  piece = null;
  if (api && typeof api.submitResult === 'function') {
    api.submitResult({
      score: Math.max(0, Math.round(score)),
      lines,
      level,
      correct: correctCount,
      answered: answeredCount,
      toppedOut,
      completed: true,
    });
  }
}

function update(dt, input) {
  if (!api) return;
  const step = Math.min(0.1, Math.max(0, Number(dt) || 0));
  now += step;
  for (const f of flashes) f.t -= step;
  flashes = flashes.filter((f) => f.t > 0);
  if (finished) {
    rememberKeys(input);
    return;
  }

  clock += step;
  if (clock >= ROUND_SECONDS) {
    finish();
    rememberKeys(input);
    return;
  }

  const touches = touchList(input);
  touchCooldown = touches.length ? TOUCH_KEY_COOLDOWN : Math.max(0, touchCooldown - step);
  const useKeys = touchCooldown === 0;

  if (mode === 'play') {
    sinceQuestion += step;
    playTouches(touches);
    if (useKeys) playKeys(input, step);
    else keySoft = false;
    if (mode === 'play') applyGravity(step);
  } else if (mode === 'question') {
    questionTimer -= step;
    questionInput(input, touches, useKeys);
    if (mode === 'question' && questionTimer <= 0) answer(-1);
  } else if (mode === 'feedback') {
    feedbackTimer -= step;
    if (feedbackTimer <= 0) {
      mode = 'play';
      current = null;
      fallTimer = 0;
    }
  }
  rememberKeys(input);
}

// ---- Rendering -------------------------------------------------------------------------

function font(size, bold) {
  return `${bold ? 'bold ' : ''}${Math.round(size)}px sans-serif`;
}

function fitText(ctx, text, maxWidth) {
  const value = String(text);
  if (ctx.measureText(value).width <= maxWidth) return value;
  let cut = value;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function wrap(ctx, text, maxWidth) {
  const result = [];
  let line = '';
  for (const raw of String(text).split(/\s+/)) {
    let word = raw;
    // Break words longer than a whole line.
    while (word && ctx.measureText(word).width > maxWidth) {
      let cut = word.length - 1;
      while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxWidth) cut -= 1;
      if (line) {
        result.push(line);
        line = '';
      }
      result.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    if (!word) continue;
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      result.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) result.push(line);
  return result;
}

function drawCell(ctx, x, y, size, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  if (!reducedEffects && size >= 10) {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + 1, y + 1, size - 2, Math.max(2, size * 0.18));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + 1, y + size - 1 - Math.max(2, size * 0.14), size - 2, Math.max(2, size * 0.14));
  }
  ctx.globalAlpha = 1;
}

function drawShape(ctx, m, ox, oy, size, color, alpha) {
  for (let r = 0; r < m.length; r += 1) {
    for (let c = 0; c < m[r].length; c += 1) {
      if (m[r][c]) drawCell(ctx, ox + c * size, oy + r * size, size, color, alpha);
    }
  }
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderHud(ctx) {
  const { hud, next, side } = layout;
  const base = Math.max(12, Math.min(18, (side ? H : W) / 24));
  const remaining = Math.max(0, Math.ceil(ROUND_SECONDS - clock));
  const statsLine = `Lines ${lines} · Lv ${level}`;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8b93b0';
  ctx.font = font(base * 0.8, false);
  ctx.fillText(fitText(ctx, context, hud.w), hud.x, hud.y);

  ctx.fillStyle = remaining <= 10 ? '#f87171' : '#ffffff';
  ctx.font = font(base * 1.6, true);
  ctx.fillText(formatTime(remaining), hud.x, hud.y + base * 1.2);

  // Portrait: score right-aligned in the HUD row; landscape: stacked under the time.
  const scoreX = side ? hud.x : hud.x + hud.w;
  const scoreY = side ? hud.y + base * 3.4 : hud.y + base * 1.2;
  ctx.textAlign = side ? 'left' : 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(base * 1.3, true);
  ctx.fillText(String(Math.round(score)), scoreX, scoreY);
  ctx.fillStyle = '#8b93b0';
  ctx.font = font(base * 0.75, false);
  ctx.fillText(fitText(ctx, statsLine, hud.w), scoreX, scoreY + base * 1.5);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#171b2e';
  ctx.fillRect(next.x, next.y, next.size, next.size);
  const m = SHAPES[nextType];
  const size = Math.floor((next.size - 10) / 4);
  const shapeW = m.length * size;
  const offset = (next.size - shapeW) / 2;
  drawShape(ctx, m, next.x + offset, next.y + offset, size, COLORS[nextType], 1);
}

function renderBoard(ctx) {
  const { cell, bx, by } = layout;
  ctx.fillStyle = '#171b2e';
  ctx.fillRect(bx, by, cell * COLS, cell * ROWS);
  if (!reducedEffects) {
    ctx.strokeStyle = '#21263c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c += 1) {
      ctx.moveTo(bx + c * cell + 0.5, by);
      ctx.lineTo(bx + c * cell + 0.5, by + ROWS * cell);
    }
    for (let r = 1; r < ROWS; r += 1) {
      ctx.moveTo(bx, by + r * cell + 0.5);
      ctx.lineTo(bx + COLS * cell, by + r * cell + 0.5);
    }
    ctx.stroke();
  }
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const value = board[r][c];
      if (value) drawCell(ctx, bx + c * cell, by + r * cell, cell, COLORS[value - 1], 1);
    }
  }
  for (const f of flashes) {
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, f.t / 0.25) * 0.7})`;
    ctx.fillRect(bx, by + f.row * cell, cell * COLS, cell);
  }
  if (piece && mode === 'play') {
    const ghost = dropDistance();
    if (ghost > 0) drawShapeClipped(ctx, piece.m, piece.x, piece.y + ghost, COLORS[piece.type], 0.22);
  }
  if (piece) drawShapeClipped(ctx, piece.m, piece.x, piece.y, COLORS[piece.type], 1);
  ctx.strokeStyle = '#2f3654';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx - 1, by - 1, cell * COLS + 2, cell * ROWS + 2);
}

// Draws a piece on the board, skipping cells still above the top row.
function drawShapeClipped(ctx, m, x, y, color, alpha) {
  const { cell, bx, by } = layout;
  for (let r = 0; r < m.length; r += 1) {
    for (let c = 0; c < m[r].length; c += 1) {
      if (m[r][c] && y + r >= 0) drawCell(ctx, bx + (x + c) * cell, by + (y + r) * cell, cell, color, alpha);
    }
  }
}

function renderQuestion(ctx) {
  const pad = layout.pad;
  const panelX = Math.max(safe.left + pad, (W - 520) / 2);
  const panelW = Math.min(520, W - safe.left - safe.right - 2 * pad);
  const inner = panelW - 32;
  const base = Math.max(13, Math.min(20, W / 22));

  ctx.fillStyle = 'rgba(8,10,20,0.72)';
  ctx.fillRect(0, 0, W, H);

  // Measure first so the panel can be centred vertically.
  ctx.font = font(base * 1.1, true);
  const questionLines = wrap(ctx, current.question, inner);
  ctx.font = font(base, false);
  const optionLines = current.options.map((o) => wrap(ctx, o.text, inner - 24).slice(0, 2));
  const lineH = base * 1.3;
  const optionHeights = optionLines.map((l) => Math.max(44, l.length * lineH + 20));
  // Mirrors the drawing below: margin, header, question, options with 10px gaps, margin.
  const panelH =
    18 + base + 16 + questionLines.length * base * 1.35 + 16 +
    optionHeights.reduce((a, b) => a + b, 0) + 10 * (optionHeights.length - 1) + 18;
  const panelY = Math.max(safe.top + pad, (H - panelH) / 2);

  ctx.fillStyle = '#1b2036';
  ctx.fillRect(panelX, panelY, panelW, panelH);

  let y = panelY + 18;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = font(base * 0.85, true);
  if (mode === 'question') {
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('BONUS QUESTION', panelX + 16, y);
    const frac = Math.max(0, questionTimer / QUESTION_SECONDS);
    ctx.fillStyle = '#2a3150';
    ctx.fillRect(panelX + 16, y + base + 4, inner, 4);
    ctx.fillStyle = frac < 0.3 ? '#f87171' : '#38bdf8';
    ctx.fillRect(panelX + 16, y + base + 4, inner * frac, 4);
  } else {
    const right = chosen >= 0 && current.options[chosen].correct;
    ctx.fillStyle = right ? '#4ade80' : '#f87171';
    const label = right ? `Correct! +${CORRECT_BONUS} · slower pieces` : chosen < 0 ? "Time's up · faster pieces" : 'Not quite · faster pieces';
    ctx.fillText(fitText(ctx, label, inner), panelX + 16, y);
  }
  y += base + 16;

  ctx.fillStyle = '#ffffff';
  ctx.font = font(base * 1.1, true);
  for (const line of questionLines) {
    ctx.fillText(line, panelX + 16, y);
    y += base * 1.35;
  }
  y += 16;

  optionRects = [];
  ctx.font = font(base, false);
  current.options.forEach((option, i) => {
    const h = optionHeights[i];
    let color = mode === 'question' && i === selected && usedKeyboard ? '#3b4a7a' : '#262c47';
    if (mode === 'feedback' && option.correct) color = '#15803d';
    else if (mode === 'feedback' && i === chosen) color = '#b91c1c';
    ctx.fillStyle = color;
    ctx.fillRect(panelX + 16, y, inner, h);
    optionRects.push({ x: panelX + 16, y, w: inner, h });
    ctx.fillStyle = '#ffffff';
    const textTop = y + (h - optionLines[i].length * lineH) / 2 + 2;
    optionLines[i].forEach((line, j) => ctx.fillText(line, panelX + 28, textTop + j * lineH));
    y += h + 10;
  });
}

function renderOver(ctx) {
  const base = Math.max(14, Math.min(22, W / 20));
  ctx.fillStyle = 'rgba(8,10,20,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(base * 1.6, true);
  ctx.fillText(toppedOut ? 'Stacked out!' : 'Time!', W / 2, H / 2 - base * 2);
  ctx.font = font(base * 1.2, true);
  ctx.fillText(`${Math.round(score)} points`, W / 2, H / 2);
  ctx.fillStyle = '#8b93b0';
  ctx.font = font(base * 0.8, false);
  ctx.fillText(`${lines} lines · ${correctCount}/${answeredCount} answers right`, W / 2, H / 2 + base * 1.6);
  ctx.textAlign = 'left';
}

function renderHint(ctx) {
  const text = usedKeyboard
    ? '←/→ move · ↑ rotate · ↓ soft drop · Space drop'
    : 'Drag to move · tap to rotate · flick down to drop';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#6b7394';
  ctx.font = font(Math.max(11, Math.min(14, W / 30)), false);
  ctx.fillText(fitText(ctx, text, W - 2 * layout.pad), W / 2, layout.hintY);
  ctx.textAlign = 'left';
}

function render(ctx) {
  if (!api) return;
  ctx.fillStyle = '#0f1220';
  ctx.fillRect(0, 0, W, H);
  renderHud(ctx);
  renderBoard(ctx);
  renderHint(ctx);
  if ((mode === 'question' || mode === 'feedback') && current) renderQuestion(ctx);
  else optionRects = [];
  if (mode === 'over') renderOver(ctx);
}

function resize(width, height, viewport) {
  W = Number(width) || W;
  H = Number(height) || H;
  if (viewport && viewport.safeArea) safe = normalizeSafeArea(viewport.safeArea);
  computeLayout();
}

function destroy() {
  api = null;
  piece = null;
  flashes = [];
}

registerGame({ renderer: '2d', init, update, render, resize, destroy });
