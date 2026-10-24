// bounce-climber/game.js
// Vertical platform climbing quiz game.
// The player bounces safely on a middle platform, with two answer platforms above (left / right).
// One platform is correct (springs player up to next question); the other breaks and ends run.
// Faster completion awards higher points.

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
let submitted = false;
let squishAnim = 0; // jump stretch effect
let facing = 1; // 1 = right, -1 = left

const touches = new Map(); // pointerId -> 'left' | 'right'
let prevKeys = {};

const GRAVITY = 900;
const BOUNCE_VELOCITY = -550;
const SUPER_BOUNCE_VELOCITY = -700;
const HORIZ_ACCEL = 1600;
const HORIZ_MAX_SPEED = 320;
const HORIZ_FRICTION = 0.88;
const LEVEL_GAP = 270;
const PLATFORM_Y_OFFSET = 120; // Up from middle platform

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
      accent: 'emerald',
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
  if (gameState === 'GAME_OVER' || gameState === 'VICTORY') {
    resetGame();
    return;
  }
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
    const optW = Math.min(136, Math.max(90, W * 0.38));
    const optH = 22;

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
        x: Math.max(12, W * 0.25 - optW / 2),
        y: baseY - PLATFORM_Y_OFFSET,
        w: optW,
        h: optH,
        type: 'option',
        side: 'left',
        isCorrect: q.correct === 'left',
        broken: false,
      },
      right: {
        x: Math.min(W - optW - 12, W * 0.75 - optW / 2),
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
  // Create two falling half-pieces
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
  // Cap dt to prevent physics tunneling
  dt = Math.min(dt, 0.05);

  if (gameState === 'GAME_OVER' || gameState === 'VICTORY') {
    if (input.keys?.Space && !prevKeys.Space) {
      resetGame();
    }
    prevKeys = { ...input.keys };
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

      // Check current level and adjacent level platforms
      const lvl = levels[currentQuestionIndex];
      if (lvl) {
        const platformsToCheck = [lvl.middle, lvl.left, lvl.right];

        // Also check previous level's safe middle platform in case player drops back down
        if (currentQuestionIndex > 0) {
          platformsToCheck.push(levels[currentQuestionIndex - 1].middle);
        }

        for (const plat of platformsToCheck) {
          if (plat.broken) continue;

          // Check feet crossing top edge of platform
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
                  // Reached summit!
                  // Base: 1000 pts per question. Speed bonus: up to 3000 pts for fast runs (<60s)
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
    // Player falling after platform broke
    if (player.y - cameraY > H + 50) {
      const partialScore = currentQuestionIndex * 1000;
      finishGame(partialScore, false);
    }
  }

  // Smooth camera tracking
  const activeLevelY = levels[Math.min(currentQuestionIndex, levels.length - 1)].middle.y;
  targetCameraY = activeLevelY - H * 0.65;
  cameraY += (targetCameraY - cameraY) * Math.min(1, dt * 6);

  prevKeys = { ...input.keys };
}

function drawPlayer(ctx, x, y, w, h, facingDir, squish) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);

  // Squish/stretch effect on bounce
  const scaleX = 1 + squish * 0.3;
  const scaleY = 1 - squish * 0.3;
  ctx.scale(scaleX * facingDir, scaleY);

  // Body
  ctx.fillStyle = '#84cc16'; // Lime green
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

function render(ctx) {
  // Background: graph paper style
  ctx.fillStyle = '#faf8ef';
  ctx.fillRect(0, 0, W, H);

  // Faint grid lines
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

    // Grass pattern on top of safe platform
    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SAFE', mid.x + mid.w / 2, mid.y + 13);

    // 2. Left and Right Option Platforms
    for (const opt of [lvl.left, lvl.right]) {
      if (opt.broken) continue;

      const isLeft = opt.side === 'left';
      const label = isLeft ? lvl.leftOption : lvl.rightOption;

      // Platform body
      ctx.fillStyle = '#3b82f6'; // Clean blue
      ctx.beginPath();
      ctx.roundRect(opt.x, opt.y, opt.w, opt.h, 6);
      ctx.fill();
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Platform text label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Truncate if long
      let displayLabel = String(label);
      if (ctx.measureText(displayLabel).width > opt.w - 12) {
        while (displayLabel.length > 3 && ctx.measureText(displayLabel + '...').width > opt.w - 12) {
          displayLabel = displayLabel.slice(0, -1);
        }
        displayLabel += '...';
      }
      ctx.fillText(displayLabel, opt.x + opt.w / 2, opt.y + opt.h / 2);
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
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.fillRect(0, 0, W, 88);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 88);
  ctx.lineTo(W, 88);
  ctx.stroke();

  // Question & Timer info
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px sans-serif';
  const qNum = Math.min(currentQuestionIndex + 1, questions.length);
  ctx.fillText(`Question ${qNum} of ${questions.length}`, 14, 10);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`Time: ${elapsedTime.toFixed(1)}s`, W - 14, 10);

  // Question text
  const currentQ = levels[Math.min(currentQuestionIndex, levels.length - 1)]?.question || '';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px sans-serif';

  // Simple wrap for header question
  const maxQWidth = W - 28;
  const words = currentQ.split(' ');
  let line = '';
  let lineY = 30;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxQWidth && line) {
      ctx.fillText(line, 14, lineY);
      line = word;
      lineY += 18;
      if (lineY > 66) break; // Keep within banner
    } else {
      line = testLine;
    }
  }
  if (line && lineY <= 66) {
    ctx.fillText(line, 14, lineY);
  }

  // Touch hint overlay at bottom when playing
  if (gameState === 'PLAY') {
    ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tap Left / Right half or use Arrow Keys to steer', W / 2, H - 18);
  }

  // Victory / Game Over Overlay
  if (gameState === 'GAME_OVER' || gameState === 'VICTORY') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (gameState === 'VICTORY') {
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('Summit Reached!', W / 2, H / 2 - 60);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(`Score: ${score}`, W / 2, H / 2 - 10);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '16px sans-serif';
      ctx.fillText(`Time: ${elapsedTime.toFixed(1)}s`, W / 2, H / 2 + 25);
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText('Platform Broke!', W / 2, H / 2 - 60);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(`Score: ${score}`, W / 2, H / 2 - 10);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '16px sans-serif';
      ctx.fillText(`Reached: ${currentQuestionIndex} / ${questions.length}`, W / 2, H / 2 + 25);
    }

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('Tap screen or press Space to retry', W / 2, H / 2 + 75);
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
