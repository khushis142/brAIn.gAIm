// dodge/game.js: dodge the falling blocks. Arrow keys to move; on touch screens, hold the
// left or right half. The runtime only forwards keys, so the game listens for pointer events
// on its own canvas.
let W, H, gameApi, username, difficulty, context, canvas;
let player, blocks, spawnTimer, score, gameOver, previousKeys;
let best = 0;
const touches = new Map(); // pointerId -> 'left' | 'right'

function init(api) {
  gameApi = api;
  W = api.width;
  H = api.height;
  username = api.username;
  difficulty = api.data.difficulty;
  context = api.data.context;
  api.setUiDesign({
    theme: {
      accent: 'teal',
      panel: 'dark',
      density: 'comfortable',
    },
    pauseMenu: {
      title: api.data.pauseTitle,
      message: api.data.pauseMessage,
      resumeLabel: api.data.resumeLabel,
    },
    leaderboard: {
      title: api.data.leaderboardTitle,
      subtitle: api.data.leaderboardSubtitle,
      scoreLabel: api.data.scoreLabel,
    },
  });
  canvas = document.getElementById('c');
  if (canvas) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('pointermove', onPointer);
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      canvas.addEventListener(type, onPointerEnd);
    }
  }
  reset();
}

function onPointer(event) {
  if (event.type === 'pointermove' && !touches.has(event.pointerId)) return;
  const rect = canvas.getBoundingClientRect();
  touches.set(event.pointerId, event.clientX - rect.left < rect.width / 2 ? 'left' : 'right');
  event.preventDefault();
}

function onPointerEnd(event) {
  touches.delete(event.pointerId);
}

function touching(side) {
  for (const value of touches.values()) if (value === side) return true;
  return false;
}

function reset() {
  player = { x: W / 2 - 25, y: H - 50, w: 50, h: 20, speed: 420 };
  blocks = [];
  spawnTimer = 0;
  score = 0;
  gameOver = false;
  previousKeys = {};
}

function update(dt, input) {
  previousKeys = { ...input.keys };
  if (gameOver) return;

  const left = input.keys.ArrowLeft || touching('left');
  const right = input.keys.ArrowRight || touching('right');
  if (left) player.x -= player.speed * dt;
  if (right) player.x += player.speed * dt;
  player.x = Math.max(0, Math.min(W - player.w, player.x));

  score += dt;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const size = 20 + Math.random() * 40;
    blocks.push({
      x: Math.random() * (W - size),
      y: -size,
      w: size,
      h: size,
      vy: 150 + Math.random() * 150 + score * 8 + difficultyOffset(),
    });
    spawnTimer = Math.max(0.15, 0.8 - score * 0.02);
  }

  for (const block of blocks) {
    block.y += block.vy * dt;
    const hit =
      block.x < player.x + player.w &&
      block.x + block.w > player.x &&
      block.y < player.y + player.h &&
      block.y + block.h > player.y;
    if (hit) {
      gameOver = true;
      best = Math.max(best, score);
      gameApi.submitResult({
        score: Math.floor(score * 10),
        game: 'dodge',
        username,
        context,
        difficulty,
        survivedSeconds: Number(score.toFixed(2)),
      });
      break;
    }
  }
  blocks = blocks.filter((block) => block.y < H);
}

function difficultyOffset() {
  if (difficulty === 'easy') return -40;
  if (difficulty === 'hard') return 80;
  return 0;
}

function render(ctx) {
  ctx.fillStyle = '#12141c';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#ff5c5c';
  for (const block of blocks) ctx.fillRect(block.x, block.y, block.w, block.h);

  ctx.fillStyle = gameOver ? '#777' : '#4fd1c5';
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Time: ' + score.toFixed(1) + 's', 16, 30);
  ctx.textAlign = 'right';
  ctx.fillText('Best: ' + best.toFixed(1) + 's', W - 16, 30);

  if (gameOver) {
    ctx.textAlign = 'center';
    ctx.font = '48px sans-serif';
    ctx.fillText('Run Complete', W / 2, H / 2 - 10);
    ctx.font = '22px sans-serif';
    ctx.fillText('See your score below', W / 2, H / 2 + 30);
  }
}

function destroy() {
  if (!canvas) return;
  canvas.removeEventListener('pointerdown', onPointer);
  canvas.removeEventListener('pointermove', onPointer);
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    canvas.removeEventListener(type, onPointerEnd);
  }
}

registerGame({ init, update, render, destroy });
