// bounce-climber/game.js
// Vertical platform climbing quiz game.
// The player bounces safely on a middle platform, with two answer platforms above (left / right).
// One platform is correct (springs player up to next question); the other breaks and ends run.
// Faster completion awards higher points. Round cannot be restarted inside the game.

let W, H, api, canvas;
let questions = [];
let currentQuestionIndex = 0;
let player;
let levels = []; // Array of { middle: Platform, left: Platform, right: Platform, qIndex: number }
let particles = [];
let brokenPieces = [];
let cameraY = 0;
let targetCameraY = 0;
let gameState = 'PLAY'; // 'PLAY', 'FALLING', 'GAME_OVER', 'VICTORY'
let elapsedTime = 0;
let score = 0;
let bestScore = 0;
let submitted = false;
let squishAnim = 0; // jump stretch effect
let facing = 1; // 1 = right, -1 = left

const touches = new Map(); // pointerId -> 'left' | 'right'

const GRAVITY = 900;
const BOUNCE_VELOCITY = -550;
const SUPER_BOUNCE_VELOCITY = -700;
const HORIZ_ACCEL = 1600;
const HORIZ_MAX_SPEED = 320;
const HORIZ_FRICTION = 0.88;
const LEVEL_GAP = 280;
const PLATFORM_Y_OFFSET = 125; // Up from middle platform

function init(gameApi) {
  api = gameApi;
  W = api.width || 360;
  H = api.height || 640;

  // Defensive data extraction
  const rawQuestions = Array.isArray(api.data?.questions) ? api.data.questions : [];
  questions = rawQuestions.filter(
    (q) =>
      typeof q?.question === 'string' &&
      typeof q?.left_option === 'string' &&
      typeof q?.right_option === 'string' &&
      (q?.correct === 'left' || q?.correct === 'right')
  );

  api.setUiDesign({
    theme: {
      accent: 'sky',
      panel: 'dark',
      density: 'comfortable',
    },
    pauseMenu: {
      title: 'Bounce Climber Paused',
      message: String(api.data?.context || 'Climb safely!'),
      resumeLabel: 'Resume Jump',
    },
    leaderboard: {
      title: 'Top Climbers',
      subtitle: String(api.data?.context || 'Leaderboard'),
      scoreLabel: 'Points',
    },
  });

  canvas = document.getElementById('c');
  if (canvas) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
      canvas.addEventListener(eventName, onPointerEnd);
    }
  }

  resetGame();
}

function onPointerDown(event) {
  // No restarting once game ends
  if (gameState === 'GAME_OVER' || gameState === 'VICTORY') return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  touches.set(event.pointerId, x < rect.width / 2 ? 'left' : 'right');
  event.preventDefault();
}

function onPointerMove(event) {
  if (!touches.has(event.pointerId)) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  touches.set(event.pointerId, x < rect.width / 2 ? 'left' : 'right');
  event.preventDefault();
}

function onPointerEnd(event) {
  touches.delete(event.pointerId);
}

function isTouching(side) {
  for (const dir of touches.values()) {
    if (dir === side) return true;
  }
  return false;
}

function resetGame() {
  currentQuestionIndex = 0;
  gameState = 'PLAY';
  elapsedTime = 0;
  score = 0;
  submitted = false;
  particles = [];
  brokenPieces = [];
  squishAnim = 0;
  facing = 1;

  if (questions.length === 0) {
    finishGame(0, false);
    return;
  }

  // Build platform stages
  levels = [];
  const startY = H - 140;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const baseY = startY - i * LEVEL_GAP;
    const midW = 96;
    // Wider and taller option platforms to fit long multi-line answers
    const optW = Math.min(160, Math.max(120, W * 0.44));
    const optH = 40;

    levels.push({
      qIndex: i,
      question: q.question,
      leftOption: q.left_option,
      rightOption: q.right_option,
      correct: q.correct,
      middle: {
        x: W / 2 - midW / 2,
        y: baseY,
        w: midW,
        h: 18,
        type: 'safe',
        broken: false,
      },
      left: {
        x: 10,
        y: baseY - PLATFORM_Y_OFFSET,
        w: optW,
        h: optH,
        type: 'option',
        side: 'left',
        isCorrect: q.correct === 'left',
        broken: false,
      },
      right: {
        x: W - optW - 10,
        y: baseY - PLATFORM_Y_OFFSET,
        w: optW,
        h: optH,
        type: 'option',
        side: 'right',
        isCorrect: q.correct === 'right',
        broken: false,
      },
      cleared: false,
    });
  }

  // Player starts on first middle platform
  const firstMid = levels[0].middle;
  player = {
    x: W / 2 - 16,
    y: firstMid.y - 34,
    w: 32,
    h: 32,
    vx: 0,
    vy: BOUNCE_VELOCITY,
  };

  cameraY = 0;
  targetCameraY = 0;
}

function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 160;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      color,
      size: 3 + Math.random() * 3,
      life: 0.5 + Math.random() * 0.3,
      maxLife: 0.8,
    });
  }
}

function breakPlatform(plat) {
  plat.broken = true;
  brokenPieces.push({
    x: plat.x,
    y: plat.y,
    w: plat.w / 2,
    h: plat.h,
    vx: -80,
    vy: 60,
    rot: 0,
    vrot: -4,
  });
  brokenPieces.push({
    x: plat.x + plat.w / 2,
    y: plat.y,
    w: plat.w / 2,
    h: plat.h,
    vx: 80,
    vy: 60,
    rot: 0,
    vrot: 4,
  });
  spawnParticles(plat.x + plat.w / 2, plat.y + plat.h / 2, '#ef4444', 16);
}

function finishGame(finalScore, victory) {
  if (submitted) return;
  submitted = true;
  score = Math.max(0, Math.floor(finalScore));
  bestScore = Math.max(bestScore, score);
  gameState = victory ? 'VICTORY' : 'GAME_OVER';
  api.submitResult({
    score,
    completed: victory,
    questionsCompleted: currentQuestionIndex,
    totalQuestions: questions.length,
    elapsedSeconds: Number(elapsedTime.toFixed(1)),
  });
}

function update(dt, input) {
  dt = Math.min(dt, 0.05);

  // Once game ends, no updates or restart
  if (gameState === 'GAME_OVER' || gameState === 'VICTORY') {
    return;
  }

  elapsedTime += dt;

  // Steering controls
  let moveDir = 0;
  if (input.keys?.ArrowLeft || input.keys?.KeyA || isTouching('left')) moveDir -= 1;
  if (input.keys?.ArrowRight || input.keys?.KeyD || isTouching('right')) moveDir += 1;

  if (moveDir !== 0) {
    facing = moveDir;
    player.vx += moveDir * HORIZ_ACCEL * dt;
    if (Math.abs(player.vx) > HORIZ_MAX_SPEED) {
      player.vx = Math.sign(player.vx) * HORIZ_MAX_SPEED;
    }
  } else {
    player.vx *= Math.pow(HORIZ_FRICTION, dt * 60);
    if (Math.abs(player.vx) < 5) player.vx = 0;
  }

  // Gravity
  player.vy += GRAVITY * dt;

  // Apply velocities
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Screen horizontal wrapping
  if (player.x + player.w < 0) {
    player.x = W;
  } else if (player.x > W) {
    player.x = -player.w;
  }

  // Squish animation recovery
  if (squishAnim > 0) {
    squishAnim -= dt * 4;
    if (squishAnim < 0) squishAnim = 0;
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Broken pieces physics
  for (let i = brokenPieces.length - 1; i >= 0; i--) {
    const piece = brokenPieces[i];
    piece.vy += GRAVITY * 0.8 * dt;
    piece.x += piece.vx * dt;
    piece.y += piece.vy * dt;
    piece.rot += piece.vrot * dt;
    if (piece.y - cameraY > H + 100) brokenPieces.splice(i, 1);
  }

  if (gameState === 'PLAY') {
    // Platform collision detection (only when falling downwards)
    if (player.vy > 0) {
      const feetY = player.y + player.h;
      const prevFeetY = feetY - player.vy * dt;

      const lvl = levels[currentQuestionIndex];
      if (lvl) {
        const platformsToCheck = [lvl.middle, lvl.left, lvl.right];

        if (currentQuestionIndex > 0) {
          platformsToCheck.push(levels[currentQuestionIndex - 1].middle);
        }

        for (const plat of platformsToCheck) {
          if (plat.broken) continue;

          const withinX =
            player.x + player.w * 0.8 >= plat.x && player.x + player.w * 0.2 <= plat.x + plat.w;
          const crossedTop = prevFeetY <= plat.y + 4 && feetY >= plat.y - 2;

          if (withinX && crossedTop) {
            if (plat.type === 'safe') {
              // Safe middle platform bounce
              player.y = plat.y - player.h;
              player.vy = BOUNCE_VELOCITY;
              squishAnim = 1;
              spawnParticles(player.x + player.w / 2, plat.y, '#10b981', 6);
              break;
            } else if (plat.type === 'option') {
              if (plat.isCorrect) {
                // Correct platform: launch upward, advance question!
                player.y = plat.y - player.h;
                player.vy = SUPER_BOUNCE_VELOCITY;
                squishAnim = 1;
                spawnParticles(player.x + player.w / 2, plat.y, '#3b82f6', 22);

                lvl.cleared = true;
                currentQuestionIndex++;

                if (currentQuestionIndex >= levels.length) {
                  // Summit reached: 1000 pts per question + speed bonus
                  const baseScore = questions.length * 1000;
                  const speedBonus = Math.max(0, Math.round((60 - elapsedTime) * 50));
                  finishGame(baseScore + speedBonus, true);
                }
                break;
              } else {
                // Wrong platform breaks!
                breakPlatform(plat);
                gameState = 'FALLING';
                break;
              }
            }
          }
        }
      }
    }

    // Check if player plummeted below active screen
    const lowestSafeLevel = Math.max(0, currentQuestionIndex - 1);
    const bottomThreshold = levels[lowestSafeLevel].middle.y + 120;
    if (player.y > bottomThreshold && player.y - cameraY > H + 40) {
      const partialScore = currentQuestionIndex * 1000;
      finishGame(partialScore, false);
    }
  } else if (gameState === 'FALLING') {
    if (player.y - cameraY > H + 50) {
      const partialScore = currentQuestionIndex * 1000;
      finishGame(partialScore, false);
    }
  }

  // Smooth camera tracking
  const activeLevelY = levels[Math.min(currentQuestionIndex, levels.length - 1)].middle.y;
  targetCameraY = activeLevelY - H * 0.65;
  cameraY += (targetCameraY - cameraY) * Math.min(1, dt * 6);
}

function drawPlayer(ctx, x, y, w, h, facingDir, squish) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);

  const scaleX = 1 + squish * 0.3;
  const scaleY = 1 - squish * 0.3;
  ctx.scale(scaleX * facingDir, scaleY);

  // Body
  ctx.fillStyle = '#84cc16';
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#4d7c0f';
  ctx.stroke();

  // Snout
  ctx.fillStyle = '#65a30d';
  ctx.beginPath();
  ctx.ellipse(12, 3, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(4, -6, 4, 0, Math.PI * 2);
  ctx.arc(10, -6, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(6, -6, 2, 0, Math.PI * 2);
  ctx.arc(12, -6, 2, 0, Math.PI * 2);
  ctx.fill();

  // Feet
  ctx.fillStyle = '#3f6212';
  ctx.beginPath();
  ctx.arc(-6, 16, 4, 0, Math.PI * 2);
  ctx.arc(6, 16, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function wrapPlatformWords(ctx, words, maxW) {
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width <= maxW) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draws text wrapped cleanly inside platform bounds so long answers never truncate
function drawWrappedPlatformText(ctx, text, cx, cy, maxW) {
  text = String(text || '').trim();

  // First try single line at 12px
  ctx.font = 'bold 12px sans-serif';
  if (ctx.measureText(text).width <= maxW) {
    ctx.fillText(text, cx, cy);
    return;
  }

  // Try 2 lines at 11px
  ctx.font = 'bold 11px sans-serif';
  const words = text.split(/\s+/);
  let lines = wrapPlatformWords(ctx, words, maxW);

  // If still overflowing width, shrink to 10px
  if (lines.length > 2 || lines.some((l) => ctx.measureText(l).width > maxW)) {
    ctx.font = 'bold 10px sans-serif';
    lines = wrapPlatformWords(ctx, words, maxW);
  }

  const lineH = 13;
  if (lines.length === 1) {
    ctx.fillText(lines[0], cx, cy);
  } else {
    const totalH = (Math.min(lines.length, 2) - 1) * lineH;
    const startY = cy - totalH / 2;
    for (let i = 0; i < Math.min(lines.length, 2); i++) {
      let lineStr = lines[i];
      if (i === 1 && lines.length > 2) {
        while (lineStr.length > 3 && ctx.measureText(lineStr + '...').width > maxW) {
          lineStr = lineStr.slice(0, -1);
        }
        lineStr += '...';
      }
      ctx.fillText(lineStr, cx, startY + i * lineH);
    }
  }
}

function render(ctx) {
  // Background: graph paper style
  ctx.fillStyle = '#faf8ef';
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = '#e2dfd2';
  ctx.lineWidth = 1;
  const gridSpacing = 28;
  const offsetY = Math.floor(-cameraY % gridSpacing);
  ctx.beginPath();
  for (let y = offsetY; y < H; y += gridSpacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  for (let x = 0; x < W; x += gridSpacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  ctx.stroke();

  // World Rendering (with camera offset)
  ctx.save();
  ctx.translate(0, -cameraY);

  // Draw broken platform pieces
  for (const piece of brokenPieces) {
    ctx.save();
    ctx.translate(piece.x + piece.w / 2, piece.y + piece.h / 2);
    ctx.rotate(piece.rot);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    ctx.restore();
  }

  // Draw levels
  for (let i = 0; i < levels.length; i++) {
    const lvl = levels[i];

    // 1. Safe Middle Platform
    const mid = lvl.middle;
    ctx.fillStyle = '#22c55e'; // Bright green
    ctx.beginPath();
    ctx.roundRect(mid.x, mid.y, mid.w, mid.h, 8);
    ctx.fill();
    ctx.strokeStyle = '#15803d';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SAFE', mid.x + mid.w / 2, mid.y + mid.h / 2);

    // 2. Left and Right Option Platforms
    for (const opt of [lvl.left, lvl.right]) {
      if (opt.broken) continue;

      const isLeft = opt.side === 'left';
      const label = isLeft ? lvl.leftOption : lvl.rightOption;

      // Platform body
      ctx.fillStyle = '#0284c7'; // Rich sky blue
      ctx.beginPath();
      ctx.roundRect(opt.x, opt.y, opt.w, opt.h, 8);
      ctx.fill();
      ctx.strokeStyle = '#0369a1';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Top step indicator line
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(opt.x + 4, opt.y + 2, opt.w - 8, 3);

      // Platform text label with wrapping
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawWrappedPlatformText(ctx, label, opt.x + opt.w / 2, opt.y + opt.h / 2 + 1, opt.w - 12);
    }
  }

  // Draw Particles
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw Player
  drawPlayer(ctx, player.x, player.y, player.w, player.h, facing, squishAnim);

  ctx.restore();

  // Top Sticky Banner HUD
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillRect(0, 0, W, 92);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 92);
  ctx.lineTo(W, 92);
  ctx.stroke();

  // Header info line
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px sans-serif';
  const qNum = Math.min(currentQuestionIndex + 1, questions.length);
  ctx.fillText(`Question ${qNum} of ${questions.length}`, 14, 10);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  const bestText = bestScore > 0 ? `Best: ${bestScore}  |  ` : '';
  ctx.fillText(`${bestText}Time: ${elapsedTime.toFixed(1)}s`, W - 14, 10);

  // Question text with clean multi-line wrapping
  const currentQ = levels[Math.min(currentQuestionIndex, levels.length - 1)]?.question || '';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px sans-serif';

  const maxQWidth = W - 28;
  const words = currentQ.split(/\s+/);
  let line = '';
  let lineY = 28;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxQWidth && line) {
      ctx.fillText(line, 14, lineY);
      line = word;
      lineY += 18;
      if (lineY > 68) break;
    } else {
      line = testLine;
    }
  }
  if (line && lineY <= 68) {
    ctx.fillText(line, 14, lineY);
  }

  // Touch controls guide when playing
  if (gameState === 'PLAY') {
    ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tap Left / Right half or use Arrow Keys to steer', W / 2, H - 16);
  }

  // Victory / Game Over Overlay - matching host leaderboard format
  if (gameState === 'GAME_OVER' || gameState === 'VICTORY') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const victory = gameState === 'VICTORY';
    ctx.fillStyle = victory ? '#22c55e' : '#ef4444';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(victory ? 'Summit Reached!' : 'Run Complete', W / 2, H / 2 - 50);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`Score: ${score}`, W / 2, H / 2);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`Best: ${bestScore}`, W / 2, H / 2 + 35);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('See your standing on the leaderboard below', W / 2, H / 2 + 75);
  }
}

function resize(width, height) {
  W = width;
  H = height;
}

function destroy() {
  if (!canvas) return;
  canvas.removeEventListener('pointerdown', onPointerDown);
  canvas.removeEventListener('pointermove', onPointerMove);
  for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
    canvas.removeEventListener(eventName, onPointerEnd);
  }
}

registerGame({ init, update, render, resize, destroy });
