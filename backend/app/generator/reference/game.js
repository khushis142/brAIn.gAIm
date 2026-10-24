// Example quiz for the brAIn.gAIn game runtime (Frontend docs/game-authoring.md).
// All content comes from api.data, generated per round from the player's study material
// and validated against config.json. Up/Down picks an option, Space confirms. On touch
// screens a tap on an option answers it: the runtime only forwards keys, so the game listens
// for pointer events on its own canvas.
let api, W, H, canvasEl;
let questions = [];
let current = 0;
let selected = 0;
let correct = 0;
let feedback = 0; // seconds left showing right/wrong after an answer
let lastAnswerCorrect = false;
let finished = false;
let prevKeys = {};
let optionRects = []; // where render() drew the options, for taps
let tap = null; // last tap in canvas pixels, handled in update()

function init(gameApi) {
  api = gameApi;
  W = api.width;
  H = api.height;
  // Skip malformed questions instead of crashing: the schema cannot check that
  // `answer` points at an existing option.
  questions = (api.data.questions || []).filter(
    (q) => Array.isArray(q.options) && q.answer >= 0 && q.answer < q.options.length,
  );
  api.setUiDesign({
    pauseMenu: { title: 'Quiz paused', message: api.data.context, resumeLabel: 'Continue' },
    leaderboard: { title: 'Quiz results', subtitle: api.data.context, scoreLabel: 'Correct %' },
  });
  canvasEl = document.getElementById('c');
  if (canvasEl) {
    canvasEl.style.touchAction = 'none';
    canvasEl.addEventListener('pointerdown', onPointerDown);
  }
  if (questions.length === 0) finish();
}

function onPointerDown(event) {
  const r = canvasEl.getBoundingClientRect();
  tap = {
    x: ((event.clientX - r.left) * W) / r.width,
    y: ((event.clientY - r.top) * H) / r.height,
  };
  event.preventDefault();
}

function pressed(input, key) {
  return input.keys[key] && !prevKeys[key];
}

function finish() {
  finished = true;
  const score = questions.length ? Math.round((100 * correct) / questions.length) : 0;
  api.submitResult({ score, correct, total: questions.length, completed: true });
}

function answer() {
  lastAnswerCorrect = selected === questions[current].answer;
  if (lastAnswerCorrect) correct += 1;
  feedback = 0.8;
}

function update(dt, input) {
  const tapped = tap;
  tap = null;
  if (finished) return;
  if (feedback > 0) {
    feedback -= dt;
    if (feedback <= 0) {
      current += 1;
      selected = 0;
      if (current >= questions.length) finish();
    }
  } else {
    const options = questions[current].options;
    if (pressed(input, 'ArrowUp')) selected = (selected + options.length - 1) % options.length;
    if (pressed(input, 'ArrowDown')) selected = (selected + 1) % options.length;
    const hit = tapped
      ? optionRects.findIndex(
          (o) => tapped.x >= o.x && tapped.x < o.x + o.w && tapped.y >= o.y && tapped.y < o.y + o.h,
        )
      : -1;
    if (hit >= 0) {
      selected = hit;
      answer();
    } else if (pressed(input, 'Space')) {
      answer();
    }
  }
  prevKeys = { ...input.keys };
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
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

function render(ctx) {
  ctx.fillStyle = '#12141c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  const pad = Math.max(16, W * 0.05);

  if (finished) {
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`${correct} / ${questions.length} correct`, pad, H / 2 - 14);
    return;
  }

  const q = questions[current];
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#8b90a0';
  ctx.fillText(`Question ${current + 1} of ${questions.length}`, pad, pad);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#ffffff';
  let y = pad + 30;
  for (const line of wrap(ctx, q.question, W - 2 * pad)) {
    ctx.fillText(line, pad, y);
    y += 28;
  }

  y += 16;
  ctx.font = '18px sans-serif';
  optionRects = [];
  q.options.forEach((option, index) => {
    let color = index === selected ? '#3b82f6' : '#262a36';
    if (feedback > 0 && index === q.answer) color = '#16a34a';
    else if (feedback > 0 && index === selected && !lastAnswerCorrect) color = '#dc2626';
    ctx.fillStyle = color;
    ctx.fillRect(pad, y, W - 2 * pad, 44);
    optionRects.push({ x: pad, y, w: W - 2 * pad, h: 44 });
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(option), pad + 12, y + 12);
    y += 54;
  });

  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#8b90a0';
  ctx.fillText('Tap an option, or Up/Down and Space', pad, H - pad - 14);
}

function resize(width, height) {
  W = width;
  H = height;
}

function destroy() {
  if (canvasEl) canvasEl.removeEventListener('pointerdown', onPointerDown);
}

registerGame({ init, update, render, resize, destroy });
