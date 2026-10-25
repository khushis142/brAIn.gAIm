// Story time: a short story is read aloud (Piper TTS audio prepared by the backend)
// and shown as karaoke-style subtitles over a muted gameplay clip the backend picks per
// round; without a playable clip, an endless blocky parkour runner is drawn instead.

const TITLE_SECONDS = 2;
const GAP_SECONDS = 0.4;

let api;
let W = 0;
let H = 0;
let safe = { top: 0, right: 0, bottom: 0, left: 0 };

let parts = [];
let phase = 'title';
let index = 0;
let timer = TITLE_SECONDS;
let gap = 0;
let heard = 0;
let needsTap = false;
let autoPaused = false;
let lastUpdate = 0;
let watchdog = null;
let finished = false;
let video = null;
let videoPaused = false;

// Runner background
let B = 32;
let scrollX = 0;
let columns = [];
let firstColumn = 0;
let lastHeight = 3;
let flatRun = 0;
let runner = { y: 0, vy: 0, onGround: false, phase: 0 };

function init(gameApi) {
  api = gameApi;
  const viewport = api.viewport || {};
  W = viewport.width || api.width;
  H = viewport.height || api.height;
  if (viewport.safeArea) safe = viewport.safeArea;
  B = blockSize();

  parts = (Array.isArray(api.data.sentences) ? api.data.sentences : [])
    .filter((s) => s && typeof s.text === 'string' && s.text.trim())
    .map((s) => {
      const text = s.text.trim();
      const words = text.split(/\s+/);
      return {
        text,
        words,
        audio: makeAudio(s.audio),
        fallback: Math.max(2.5, words.length * 0.4),
        elapsed: 0,
        progress: 0,
      };
    });

  api.setUiDesign({
    theme: { accent: 'sky', panel: 'dark', density: 'comfortable' },
    pauseMenu: {
      title: 'Story paused',
      message: 'The story waits for you.',
      resumeLabel: 'Keep listening',
    },
    leaderboard: {
      title: 'Story finished',
      subtitle: 'Thanks for listening to the end.',
      scoreLabel: 'Listened',
    },
  });

  runner.y = groundTop(columnAt(runnerX())) || H * 0.7;
  video = makeVideo(api.data.backgroundVideo);
  // The feed stops calling update() while the card is paused; media has to stop with it.
  lastUpdate = performance.now();
  watchdog = setInterval(() => {
    if (performance.now() - lastUpdate <= 300) return;
    const audio = currentAudio();
    if (audio && !audio.paused) {
      audio.pause();
      autoPaused = true;
    }
    if (video && !video.paused) {
      video.pause();
      videoPaused = true;
    }
  }, 200);

  if (!parts.length) finish();
}

// Only audio the host prepared as a data URL is played; anything else falls back to timing.
function makeAudio(source) {
  if (typeof source !== 'string' || !source.startsWith('data:audio/')) return null;
  try {
    const audio = new Audio(source);
    audio.preload = 'auto';
    return audio;
  } catch (error) {
    return null;
  }
}

// A muted, looping background clip; only a data URL the host prepared is accepted.
function makeVideo(source) {
  if (typeof source !== 'string' || !source.startsWith('data:video/')) return null;
  try {
    const element = document.createElement('video');
    element.muted = true;
    element.loop = true;
    element.playsInline = true;
    element.src = source;
    playVideo(element);
    return element;
  } catch (error) {
    return null;
  }
}

function playVideo(element) {
  try {
    const result = element.play();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (error) {
    // The runner background is drawn while the clip cannot play.
  }
}

function currentAudio() {
  return phase === 'reading' && parts[index] ? parts[index].audio : null;
}

function play(part) {
  const audio = part.audio;
  if (!audio) return;
  let result;
  try {
    result = audio.play();
  } catch (error) {
    part.audio = null;
    return;
  }
  if (result && typeof result.catch === 'function') {
    result.catch((error) => {
      if (error && error.name === 'NotAllowedError') needsTap = true;
      else part.audio = null;
    });
  }
}

function startPart(i) {
  index = i;
  const part = parts[i];
  part.elapsed = 0;
  part.progress = 0;
  play(part);
}

function finish() {
  if (finished) return;
  finished = true;
  phase = 'done';
  const total = parts.length;
  api.submitResult({
    score: total ? Math.round((100 * heard) / total) : 0,
    heard,
    total,
    completed: total > 0 && heard === total,
  });
}

function update(dt, input) {
  lastUpdate = performance.now();
  if (videoPaused) {
    videoPaused = false;
    playVideo(video);
  }
  updateRunner(dt);
  if (finished) return;

  const part = parts[index];
  if (autoPaused) {
    autoPaused = false;
    if (part && part.audio && !part.audio.ended) play(part);
  }

  if (needsTap) {
    const tapped = (input.pointer && input.pointer.justPressed) ||
      (input.keys && input.keys.Space && input.keys.Space.justPressed);
    if (tapped) {
      needsTap = false;
      if (part) play(part);
    }
    return;
  }

  if (phase === 'title') {
    timer -= dt;
    if (timer <= 0) {
      phase = 'reading';
      startPart(0);
    }
    return;
  }

  if (gap > 0) {
    gap -= dt;
    if (gap <= 0) {
      if (index + 1 >= parts.length) finish();
      else startPart(index + 1);
    }
    return;
  }

  part.elapsed += dt;
  let done;
  if (part.audio && part.audio.error) part.audio = null;
  if (part.audio) {
    const duration = part.audio.duration;
    part.progress = Number.isFinite(duration) && duration > 0 ? part.audio.currentTime / duration : 0;
    done = part.audio.ended;
  } else {
    part.progress = part.elapsed / part.fallback;
    done = part.progress >= 1;
  }
  if (done) {
    part.progress = 1;
    heard += 1;
    gap = GAP_SECONDS;
  }
}

// --- Runner ---------------------------------------------------------------

function blockSize() {
  return Math.max(18, Math.min(W, H) / 9);
}

function floorY() {
  return H - (safe.bottom || 0);
}

function runnerX() {
  return scrollX + W * 0.3;
}

function nextHeight() {
  // Gaps (1 to 2 blocks) and steps (one block up or down) only follow at least 3 flat
  // columns, so the automatic jump always has room to land.
  if (flatRun >= 3 && Math.random() < 0.22) {
    flatRun = 0;
    const length = Math.random() < 0.5 ? 1 : 2;
    for (let i = 1; i < length; i += 1) columns.push(0);
    return 0;
  }
  if (flatRun >= 3 && Math.random() < 0.35) {
    const height = Math.max(2, Math.min(4, lastHeight + (Math.random() < 0.5 ? -1 : 1)));
    if (height !== lastHeight) flatRun = 0;
    lastHeight = height;
  }
  flatRun += 1;
  return lastHeight;
}

function columnAt(worldX) {
  const c = Math.floor(worldX / B);
  while (firstColumn + columns.length <= c) columns.push(nextHeight());
  return columns[c - firstColumn] || 0;
}

function groundTop(height) {
  return height ? floorY() - height * B : null;
}

function updateRunner(dt) {
  const speed = B * 4.5;
  const gravity = B * 55;
  scrollX += speed * dt;
  runner.phase += dt * 10;

  const dropped = Math.floor(scrollX / B) - 2 - firstColumn;
  if (dropped > 0) {
    columns.splice(0, dropped);
    firstColumn += dropped;
  }
  columnAt(scrollX + W + B);

  const x = runnerX();
  const here = columnAt(x);
  const ahead = columnAt(x + B * 0.45);
  if (runner.onGround && (ahead === 0 || ahead > here)) {
    runner.vy = -B * 18;
    runner.onGround = false;
  }

  const previous = runner.y;
  runner.vy += gravity * dt;
  runner.y += runner.vy * dt;
  const top = groundTop(here);
  runner.onGround = false;
  if (top !== null && runner.vy >= 0 && runner.y >= top) {
    if (previous <= top + B * 0.3 || runner.y - top < B * 0.6) {
      runner.y = top;
      runner.vy = 0;
      runner.onGround = true;
    }
  }
  if (runner.y > H + B * 2) {
    runner.y = H * 0.3;
    runner.vy = 0;
  }
}

function hash(a, b) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function drawWorld(ctx, reduced) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#6ab7ff');
  sky.addColorStop(1, '#cdeaff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  if (!reduced) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const cloudScroll = scrollX * 0.25;
    const spacing = B * 7;
    const first = Math.floor(cloudScroll / spacing) - 1;
    for (let i = first; i < first + W / spacing + 3; i += 1) {
      const x = i * spacing - cloudScroll;
      const y = H * 0.08 + hash(i, 1) * H * 0.3;
      const w = B * (2 + Math.floor(hash(i, 2) * 3));
      ctx.fillRect(x, y, w, B * 0.6);
      ctx.fillRect(x + B * 0.5, y - B * 0.4, w - B, B * 0.4);
    }
  }

  const start = Math.floor(scrollX / B);
  const bottom = floorY();
  for (let c = start; c <= start + Math.ceil(W / B) + 1; c += 1) {
    const height = columnAt(c * B + 0.5);
    if (!height) continue;
    const x = Math.round(c * B - scrollX);
    const size = Math.ceil(B);
    ctx.fillStyle = '#6b6b6b';
    ctx.fillRect(x, bottom, size, H - bottom);
    for (let row = 0; row < height; row += 1) {
      const y = Math.round(bottom - (row + 1) * B);
      const topBlock = row === height - 1;
      ctx.fillStyle = row === 0 && height > 2 ? '#7d7d7d' : '#8b5a2b';
      ctx.fillRect(x, y, size, size);
      if (topBlock) {
        ctx.fillStyle = '#5fae3c';
        ctx.fillRect(x, y, size, Math.ceil(B * 0.28));
      }
      if (!reduced) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
        for (let k = 0; k < 4; k += 1) {
          const sx = hash(c, row * 7 + k) * (B - B / 8);
          const sy = B * 0.3 + hash(row, c * 3 + k) * (B * 0.7 - B / 8);
          ctx.fillRect(x + sx, y + sy, B / 8, B / 8);
        }
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
  }
  drawRunner(ctx);
}

function drawRunner(ctx) {
  const u = B / 8;
  const x = W * 0.3;
  const y = runner.y;
  const swing = runner.onGround ? Math.sin(runner.phase) * u * 1.5 : u;
  ctx.fillStyle = '#2d2d4a';
  ctx.fillRect(x - u * 2, y - u * 6, u * 2, u * 6 - Math.max(0, swing));
  ctx.fillRect(x, y - u * 6, u * 2, u * 6 - Math.max(0, -swing));
  ctx.fillStyle = '#e8772e';
  ctx.fillRect(x - u * 2, y - u * 12, u * 4, u * 6);
  ctx.fillStyle = '#f1c27d';
  ctx.fillRect(x - u * 3, y - u * 12 + swing * 0.5, u, u * 5);
  ctx.fillRect(x + u * 2, y - u * 12 - swing * 0.5, u, u * 5);
  ctx.fillRect(x - u * 2, y - u * 16, u * 4, u * 4);
  ctx.fillStyle = '#3b2414';
  ctx.fillRect(x - u * 2, y - u * 16, u * 4, u);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(x + u * 0.5, y - u * 14.5, u, u);
}

// --- Text -----------------------------------------------------------------

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

function layoutWords(ctx, words, maxWidth) {
  const space = ctx.measureText(' ').width;
  const lines = [[]];
  let width = 0;
  words.forEach((word, i) => {
    const w = ctx.measureText(word).width;
    const line = lines[lines.length - 1];
    if (line.length && width + space + w > maxWidth) {
      lines.push([{ word, i, w }]);
      width = w;
    } else {
      line.push({ word, i, w });
      width += (line.length > 1 ? space : 0) + w;
    }
  });
  return { lines, space };
}

function drawHeader(ctx) {
  const pad = Math.max(14, W * 0.045);
  const top = (safe.top || 0) + pad;
  const scrim = ctx.createLinearGradient(0, 0, 0, top + 90);
  scrim.addColorStop(0, 'rgba(2, 6, 23, 0.7)');
  scrim.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, top + 90);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = `bold ${Math.max(11, W * 0.03)}px sans-serif`;
  ctx.fillText('STORY TIME', pad, top);
  ctx.font = `bold ${Math.max(16, Math.min(24, W * 0.058))}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(api.data.title || ''), pad, top + 18, W - pad * 2);

  const segmentW = (W - pad * 2 - (parts.length - 1) * 6) / Math.max(1, parts.length);
  const barY = top + 52;
  parts.forEach((part, i) => {
    const x = pad + i * (segmentW + 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x, barY, segmentW, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, barY, segmentW * Math.min(1, part.progress), 5);
  });
  return barY + 20;
}

function drawSubtitle(ctx, top) {
  const pad = Math.max(14, W * 0.045);
  const boxW = W - pad * 2;
  const size = Math.max(17, Math.min(28, W * 0.064));
  ctx.font = `bold ${size}px sans-serif`;
  const lineHeight = size * 1.35;

  let lines;
  let space = 0;
  let spoken = 0;
  let centered = false;
  if (phase === 'title' || phase === 'done' || !parts.length) {
    const text = phase === 'done' ? 'The end.' : String(api.data.title || 'A short story');
    ({ lines, space } = layoutWords(ctx, text.split(/\s+/), boxW - 32));
    spoken = Infinity;
    centered = true;
  } else {
    const part = parts[index];
    ({ lines, space } = layoutWords(ctx, part.words, boxW - 32));
    spoken = Math.floor(part.progress * part.words.length + 1e-6);
  }

  const boxH = lines.length * lineHeight + 32;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.68)';
  roundedRect(ctx, pad, top, boxW, boxH, 18);
  ctx.fill();

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let y = top + 16;
  for (const line of lines) {
    const lineW = line.reduce((sum, t) => sum + t.w, 0) + space * (line.length - 1);
    let x = centered ? (W - lineW) / 2 : pad + 16;
    for (const token of line) {
      if (token.i < spoken) ctx.fillStyle = '#ffffff';
      else if (token.i === spoken) ctx.fillStyle = '#facc15';
      else ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(token.word, x, y);
      x += token.w + space;
    }
    y += lineHeight;
  }

  if (needsTap) {
    const tapY = top + boxH + 16;
    ctx.fillStyle = '#facc15';
    roundedRect(ctx, W / 2 - 90, tapY, 180, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.max(14, W * 0.04)}px sans-serif`;
    ctx.fillText('TAP TO LISTEN', W / 2, tapY + 22);
  }
}

// Draws the clip scaled to cover the screen; false while it has no frame to show.
function drawVideo(ctx) {
  if (!video || video.error || video.readyState < 2 || !video.videoWidth) return false;
  const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
  const w = video.videoWidth * scale;
  const h = video.videoHeight * scale;
  ctx.drawImage(video, (W - w) / 2, (H - h) / 2, w, h);
  return true;
}

function render(ctx) {
  const reduced = Boolean(api.performance && api.performance.reducedEffects);
  if (!drawVideo(ctx)) drawWorld(ctx, reduced);
  drawSubtitle(ctx, drawHeader(ctx));
}

function resize(width, height, viewport) {
  W = width;
  H = height;
  if (viewport && viewport.safeArea) safe = viewport.safeArea;
  const next = blockSize();
  scrollX *= next / B;
  B = next;
  runner.y = groundTop(columnAt(runnerX())) || H * 0.3;
  runner.vy = 0;
}

function destroy() {
  if (watchdog) clearInterval(watchdog);
  const audio = currentAudio();
  if (audio) audio.pause();
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}

registerGame({ init, update, render, resize, destroy });
