// Mini golf quiz: every hole asks a question and has one cup per answer.
// Bank the ball off walls into the cup of the correct answer within MAX_STROKES shots.

const MAX_STROKES = 3;
const POINTS = [100, 70, 40];
const CUP_COLORS = ['#f59e0b', '#38bdf8', '#f472b6', '#a78bfa'];
// Cup positions (normalized to the course) for 2, 3 and 4 answers.
const CUP_LAYOUTS = {
  2: [[0.28, 0.26], [0.72, 0.26]],
  3: [[0.18, 0.3], [0.5, 0.22], [0.82, 0.3]],
  4: [[0.13, 0.34], [0.38, 0.22], [0.62, 0.34], [0.87, 0.22]],
};
const TEE = [0.5, 0.88];
// Interior walls [x1, y1, x2, y2] (normalized). Each course blocks the straight line from
// the tee to the cups, so the ball has to be banked off walls. Courses may be mirrored.
// Walls stay below y = 0.4 so they never hide the answer flags above the cups.
const COURSES = [
  [[0.14, 0.55, 0.86, 0.55]],
  [[0, 0.68, 0.62, 0.68], [0.38, 0.47, 1, 0.47]],
  [[0.16, 0.62, 0.5, 0.44], [0.5, 0.44, 0.84, 0.62]],
  [[0, 0.44, 0.38, 0.44], [0.62, 0.44, 1, 0.44], [0.28, 0.6, 0.72, 0.6]],
  [[0, 0.5, 0.4, 0.62], [1, 0.5, 0.6, 0.62], [0.42, 0.5, 0.58, 0.5]],
];

let api;
let W = 0;
let H = 0;
let safe = { top: 0, right: 0, bottom: 0, left: 0 };
let course = { x: 0, y: 0, w: 1, h: 1, unit: 1 };
let cardH = 0;

let holes = [];
let current = 0;
let cups = [];
let walls = [];
let courseOrder = [];
let ball = { x: 0, y: 0, vx: 0, vy: 0, scale: 1 };
let strokes = 0;
let state = 'aim';
let aimAngle = -Math.PI / 2;
let power = 0;
let dragging = false;
let dragStart = { x: 0, y: 0 };
let charging = false;
let chargeDir = 1;
let pointerGrace = 0;
let sinkCup = null;
let timer = 0;
let outcome = '';
let results = [];
let finished = false;

function init(gameApi) {
  api = gameApi;
  const viewport = api.viewport || {};
  W = viewport.width || api.width;
  H = viewport.height || api.height;
  if (viewport.safeArea) safe = viewport.safeArea;
  layout();

  holes = (Array.isArray(api.data.holes) ? api.data.holes : [])
    .map(parseHole)
    .filter(Boolean);

  api.setUiDesign({
    theme: { accent: 'teal', panel: 'dark', density: 'comfortable' },
    pauseMenu: {
      title: 'Putting paused',
      message: 'Line up your shot when you are ready.',
      resumeLabel: 'Back to the green',
    },
    leaderboard: {
      title: 'Clubhouse',
      subtitle: 'Fewer shots on the right cup score more.',
      scoreLabel: 'Golf points',
    },
  });

  if (!holes.length) finish();
  else startHole();
}

// A usable hole, or null when the data breaks a rule the schema cannot express.
function parseHole(hole) {
  if (!hole || typeof hole.question !== 'string' || !hole.question.trim()) return null;
  if (!Array.isArray(hole.options) || hole.options.length < 2 || hole.options.length > 4) return null;
  const options = hole.options.map((o) => (typeof o === 'string' ? o.trim() : ''));
  if (options.some((o) => !o)) return null;
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null;
  if (!Number.isInteger(hole.answer) || hole.answer < 0 || hole.answer >= options.length) return null;
  return { question: hole.question.trim(), options, answer: hole.answer };
}

function layout() {
  const pad = Math.max(12, W * 0.04);
  const top = (safe.top || 0) + pad;
  cardH = Math.max(96, Math.min(150, H * 0.18));
  const hintH = 26;
  const x = (safe.left || 0) + pad;
  const y = top + cardH + pad * 0.75;
  const w = Math.max(1, W - x - (safe.right || 0) - pad);
  const h = Math.max(1, H - y - (safe.bottom || 0) - pad - hintH);
  course = { x, y, w, h, unit: Math.min(w, h) };
}

function px(nx) {
  return course.x + nx * course.w;
}

function py(ny) {
  return course.y + ny * course.h;
}

function ballR() {
  return course.unit * 0.03;
}

function cupR() {
  return course.unit * 0.055;
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function startHole() {
  const hole = holes[current];
  const order = shuffle(hole.options.map((_, i) => i));
  const spots = CUP_LAYOUTS[order.length];
  cups = order.map((option, slot) => ({
    nx: spots[slot][0],
    ny: spots[slot][1],
    label: hole.options[option],
    correct: option === hole.answer,
    color: CUP_COLORS[slot],
  }));
  if (!courseOrder.length) courseOrder = shuffle(COURSES.map((_, i) => i));
  const mirrored = Math.random() < 0.5;
  walls = COURSES[courseOrder.pop()].map(([x1, y1, x2, y2]) =>
    mirrored ? [1 - x1, y1, 1 - x2, y2] : [x1, y1, x2, y2],
  );
  ball = { x: px(TEE[0]), y: py(TEE[1]), vx: 0, vy: 0, scale: 1 };
  strokes = 0;
  aimAngle = -Math.PI / 2;
  power = 0;
  dragging = false;
  charging = false;
  sinkCup = null;
  state = 'aim';
}

function wallWidth() {
  return course.unit * 0.03;
}

function closestOnSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return [ax + t * dx, ay + t * dy];
}

function pressed(input, key) {
  const value = input.keys && input.keys[key];
  return Boolean(value && value.justPressed);
}

function released(input, key) {
  const value = input.keys && input.keys[key];
  return Boolean(value && value.justReleased);
}

function held(input, key) {
  const value = input.keys && input.keys[key];
  return Boolean(value && value.held);
}

function shoot() {
  const speed = course.unit * 3.3 * power;
  ball.vx = Math.cos(aimAngle) * speed;
  ball.vy = Math.sin(aimAngle) * speed;
  strokes += 1;
  power = 0;
  dragging = false;
  charging = false;
  state = 'rolling';
}

function updateAim(dt, input) {
  const pointer = input.pointer;
  // Touch also presses emulated keys (tap = Space, hold = arrows); ignore them around touches.
  if (pointer && (pointer.down || pointer.justPressed || pointer.justReleased)) {
    pointerGrace = 0.35;
    charging = false;
  } else {
    pointerGrace = Math.max(0, pointerGrace - dt);
  }

  if (pointer) {
    if (pointer.justPressed) {
      dragging = true;
      dragStart = { x: pointer.x, y: pointer.y };
    }
    if (dragging) {
      const dx = pointer.x - dragStart.x;
      const dy = pointer.y - dragStart.y;
      const length = Math.hypot(dx, dy);
      power = Math.min(1, length / (course.unit * 0.45));
      if (length > 4) aimAngle = Math.atan2(-dy, -dx);
      if (!pointer.down || pointer.justReleased) {
        if (power >= 0.06) shoot();
        else {
          dragging = false;
          power = 0;
        }
      }
      return;
    }
  }
  if (pointerGrace > 0) return;

  if (held(input, 'ArrowLeft')) aimAngle -= 1.6 * dt;
  if (held(input, 'ArrowRight')) aimAngle += 1.6 * dt;
  if (pressed(input, 'Space')) {
    charging = true;
    chargeDir = 1;
    power = 0;
  }
  if (charging) {
    power += chargeDir * 1.1 * dt;
    if (power >= 1) {
      power = 1;
      chargeDir = -1;
    } else if (power <= 0) {
      power = 0;
      chargeDir = 1;
    }
    if (released(input, 'Space')) {
      if (power >= 0.06) shoot();
      else charging = false;
    }
  }
}

function bounceWalls() {
  const r = ballR();
  const restitution = 0.75;
  if (ball.x < course.x + r) {
    ball.x = course.x + r;
    ball.vx = Math.abs(ball.vx) * restitution;
  } else if (ball.x > course.x + course.w - r) {
    ball.x = course.x + course.w - r;
    ball.vx = -Math.abs(ball.vx) * restitution;
  }
  if (ball.y < course.y + r) {
    ball.y = course.y + r;
    ball.vy = Math.abs(ball.vy) * restitution;
  } else if (ball.y > course.y + course.h - r) {
    ball.y = course.y + course.h - r;
    ball.vy = -Math.abs(ball.vy) * restitution;
  }
  const min = r + wallWidth() / 2;
  for (const [x1, y1, x2, y2] of walls) {
    const [cx, cy] = closestOnSegment(ball.x, ball.y, px(x1), py(y1), px(x2), py(y2));
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < min && dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x = cx + nx * min;
      ball.y = cy + ny * min;
      const along = ball.vx * nx + ball.vy * ny;
      if (along < 0) {
        ball.vx -= (1 + restitution) * along * nx;
        ball.vy -= (1 + restitution) * along * ny;
      }
    }
  }
}

// The cup the ball dropped into, or null. Cups pull a nearby ball in; fast balls lip out.
function checkCups(dt) {
  const capture = cupR();
  for (const cup of cups) {
    const dx = px(cup.nx) - ball.x;
    const dy = py(cup.ny) - ball.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= capture * 1.15) continue;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (dist < capture * 0.8 && speed < course.unit * 1.4) return cup;
    const pull = course.unit * 5 * dt;
    ball.vx += (dx / (dist || 1)) * pull;
    ball.vy += (dy / (dist || 1)) * pull;
  }
  return null;
}

function updateRolling(dt) {
  const speed = Math.hypot(ball.vx, ball.vy);
  const steps = Math.max(1, Math.ceil((speed * dt) / (ballR() * 0.5)));
  const step = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    ball.x += ball.vx * step;
    ball.y += ball.vy * step;
    bounceWalls();
    const cup = checkCups(step);
    if (cup) {
      sinkCup = cup;
      state = 'sinking';
      timer = 0.3;
      return;
    }
  }
  const now = Math.hypot(ball.vx, ball.vy);
  const slowed = Math.max(0, now - course.unit * 1.7 * dt) * Math.exp(-0.5 * dt);
  if (slowed < course.unit * 0.04) {
    ball.vx = 0;
    ball.vy = 0;
    if (strokes >= MAX_STROKES) endHole('out');
    else state = 'aim';
    return;
  }
  ball.vx *= slowed / now;
  ball.vy *= slowed / now;
}

function endHole(result) {
  outcome = result;
  results.push({ correct: result === 'correct', strokes });
  state = 'feedback';
  timer = 1.6;
}

function finish() {
  if (finished) return;
  finished = true;
  state = 'done';
  const correct = results.filter((r) => r.correct).length;
  const score = results.reduce((sum, r) => sum + (r.correct ? POINTS[r.strokes - 1] || 0 : 0), 0);
  api.submitResult({
    score,
    correct,
    total: holes.length,
    strokes: results.reduce((sum, r) => sum + r.strokes, 0),
    completed: true,
  });
}

function update(dt, input) {
  if (finished) return;
  if (state === 'aim') updateAim(dt, input);
  else if (state === 'rolling') updateRolling(dt);
  else if (state === 'sinking') {
    timer -= dt;
    const t = Math.max(0, timer / 0.3);
    ball.x += (px(sinkCup.nx) - ball.x) * Math.min(1, dt * 20);
    ball.y += (py(sinkCup.ny) - ball.y) * Math.min(1, dt * 20);
    ball.scale = 0.4 + 0.6 * t;
    if (timer <= 0) endHole(sinkCup.correct ? 'correct' : 'wrong');
  } else if (state === 'feedback') {
    timer -= dt;
    if (timer <= 0) {
      current += 1;
      if (current >= holes.length) finish();
      else startHole();
    }
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCard(ctx) {
  const x = course.x;
  const y = course.y - cardH - Math.max(12, W * 0.04) * 0.75;
  const w = course.w;
  ctx.fillStyle = 'rgba(8, 24, 18, 0.94)';
  roundedRect(ctx, x, y, w, cardH, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(134, 239, 172, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const inset = 16;
  const small = Math.max(11, Math.min(14, W * 0.034));
  ctx.textBaseline = 'top';
  ctx.font = `bold ${small}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#86efac';
  ctx.fillText(`HOLE ${Math.min(current + 1, holes.length)} / ${holes.length}`, x + inset, y + 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cbd5e1';
  const shown = state === 'aim' ? strokes + 1 : strokes;
  ctx.fillText(`SHOT ${Math.min(shown, MAX_STROKES)} / ${MAX_STROKES}`, x + w - inset, y + 12);

  const hole = holes[current];
  if (!hole) return;
  let size = Math.max(14, Math.min(22, W * 0.056));
  let lines;
  const room = cardH - small - 30;
  do {
    ctx.font = `bold ${size}px sans-serif`;
    lines = wrapText(ctx, hole.question, w - inset * 2);
    size -= 1;
  } while (lines.length * (size + 1) * 1.25 > room && size > 11);
  const lineHeight = (size + 1) * 1.25;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  let ty = y + small + 22;
  for (const line of lines.slice(0, Math.max(1, Math.floor(room / lineHeight)))) {
    ctx.fillText(line, x + inset, ty, w - inset * 2);
    ty += lineHeight;
  }
}

function drawCourse(ctx, reduced) {
  const { x, y, w, h } = course;
  ctx.fillStyle = '#7c4a1e';
  roundedRect(ctx, x - 6, y - 6, w + 12, h + 12, 20);
  ctx.fill();
  ctx.fillStyle = '#2f9e44';
  roundedRect(ctx, x, y, w, h, 14);
  ctx.fill();
  if (!reduced) {
    ctx.save();
    roundedRect(ctx, x, y, w, h, 14);
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    const band = Math.max(18, h / 12);
    for (let by = y; by < y + h; by += band * 2) ctx.fillRect(x, by, w, band);
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.ellipse(px(TEE[0]), py(TEE[1]), ballR() * 2.2, ballR() * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = 'round';
  for (const [color, width] of [['#7c4a1e', wallWidth()], ['#a16207', wallWidth() * 0.45]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of walls) {
      ctx.moveTo(px(x1), py(y1));
      ctx.lineTo(px(x2), py(y2));
    }
    ctx.stroke();
  }
}

function drawCups(ctx) {
  const r = cupR();
  const showAnswer = state === 'feedback';
  for (const cup of cups) {
    const cx = px(cup.nx);
    const cy = py(cup.ny);
    if (showAnswer && (cup.correct || cup === sinkCup)) {
      ctx.strokeStyle = cup.correct ? '#86efac' : '#fca5a5';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLabels(ctx) {
  const r = cupR();
  const maxWidth = Math.min(course.w * 0.32, (course.w / cups.length) * 0.94);
  for (const cup of cups) {
    const cx = px(cup.nx);
    const cy = py(cup.ny);
    let size = 14;
    let lines;
    do {
      ctx.font = `bold ${size}px sans-serif`;
      lines = wrapText(ctx, cup.label, maxWidth - 12);
      size -= 1;
    } while (lines.length > 2 && size > 10);
    size += 1;
    lines = lines.slice(0, 3);
    const lineHeight = size * 1.2;
    const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const pillW = Math.min(maxWidth, textWidth + 14);
    const pillH = lines.length * lineHeight + 8;
    const pillX = Math.max(course.x + 2, Math.min(course.x + course.w - pillW - 2, cx - pillW / 2));
    const pillY = cy - r - 10 - pillH;

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, pillY + pillH);
    ctx.stroke();

    let fill = cup.color;
    if (state === 'feedback') fill = cup.correct ? '#16a34a' : cup === sinkCup ? '#dc2626' : '#475569';
    ctx.fillStyle = fill;
    roundedRect(ctx, pillX, pillY, pillW, pillH, 8);
    ctx.fill();
    ctx.fillStyle = '#0b1120';
    if (state === 'feedback') ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let ty = pillY + 4;
    for (const line of lines) {
      ctx.fillText(line, pillX + pillW / 2, ty, pillW - 8);
      ty += lineHeight;
    }
  }
}

function drawAim(ctx) {
  if (state !== 'aim') return;
  const length = course.unit * (0.12 + power * 0.5);
  const dx = Math.cos(aimAngle);
  const dy = Math.sin(aimAngle);
  const hue = 120 - power * 120;
  ctx.fillStyle = power > 0 ? `hsl(${hue}, 85%, 60%)` : 'rgba(255, 255, 255, 0.6)';
  const dot = Math.max(2, ballR() * 0.35);
  for (let d = ballR() * 2; d < length; d += dot * 3.5) {
    ctx.beginPath();
    ctx.arc(ball.x + dx * d, ball.y + dy * d, dot, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBall(ctx, reduced) {
  const r = ballR() * ball.scale;
  if (!reduced) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(ball.x + r * 0.3, ball.y + r * 0.5, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBanner(ctx) {
  if (state !== 'feedback') return;
  const correctCup = cups.find((c) => c.correct);
  const title = { correct: 'IN THE RIGHT CUP!', wrong: 'WRONG CUP', out: 'OUT OF SHOTS' }[outcome];
  const y = py(0.58);
  ctx.fillStyle = 'rgba(3, 12, 8, 0.82)';
  ctx.fillRect(course.x, y - 38, course.w, 76);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = outcome === 'correct' ? '#86efac' : '#fecaca';
  ctx.font = `bold ${Math.max(18, W * 0.06)}px sans-serif`;
  ctx.fillText(title, W / 2, y - 12, course.w - 20);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `${Math.max(13, W * 0.038)}px sans-serif`;
  const detail = outcome === 'correct'
    ? `+${POINTS[strokes - 1] || 0} points`
    : `Answer: ${correctCup ? correctCup.label : ''}`;
  ctx.fillText(detail, W / 2, y + 18, course.w - 20);
}

function drawHint(ctx) {
  ctx.fillStyle = 'rgba(220, 252, 231, 0.6)';
  ctx.font = `bold ${Math.max(10, W * 0.03)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = state === 'aim' ? 'DRAG BACK & RELEASE  |  ← → + HOLD SPACE' : '';
  ctx.fillText(text, W / 2, course.y + course.h + 19, W - 20);
}

function render(ctx) {
  const reduced = Boolean(api.performance && api.performance.reducedEffects);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#052e16');
  bg.addColorStop(1, '#0b1f17');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawCard(ctx);
  drawCourse(ctx, reduced);
  drawCups(ctx);
  if (state !== 'feedback') drawBall(ctx, reduced);
  drawAim(ctx);
  drawLabels(ctx);
  drawBanner(ctx);
  drawHint(ctx);

  if (finished) {
    const correct = results.filter((r) => r.correct).length;
    ctx.fillStyle = 'rgba(3, 12, 8, 0.85)';
    ctx.fillRect(0, H * 0.38, W, H * 0.22);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#86efac';
    ctx.font = `bold ${Math.max(22, W * 0.07)}px sans-serif`;
    ctx.fillText('ROUND COMPLETE', W / 2, H * 0.46);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.max(15, W * 0.045)}px sans-serif`;
    ctx.fillText(`${correct} of ${holes.length} holes correct`, W / 2, H * 0.53);
  }
}

function resize(width, height, viewport) {
  const old = course;
  const nx = (ball.x - old.x) / old.w;
  const ny = (ball.y - old.y) / old.h;
  W = width;
  H = height;
  if (viewport && viewport.safeArea) safe = viewport.safeArea;
  layout();
  const ratio = course.unit / old.unit;
  ball.x = px(nx);
  ball.y = py(ny);
  ball.vx *= ratio;
  ball.vy *= ratio;
}

registerGame({ init, update, render, resize });
