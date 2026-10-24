// dodge.js: dodge the falling blocks. Arrow keys or A/D to move, Space to restart.
let W, H;
let player, blocks, spawnTimer, score, gameOver;
let best = 0;

function init(api) {
  W = api.width;
  H = api.height;
  reset();
}

function reset() {
  player = { x: W / 2 - 25, y: H - 50, w: 50, h: 20, speed: 420 };
  blocks = [];
  spawnTimer = 0;
  score = 0;
  gameOver = false;
}

function update(dt, input) {
  if (gameOver) {
    if (input.keys['Space']) reset();
    return;
  }

  // Move player
  const left = input.keys['ArrowLeft'] || input.keys['KeyA'];
  const right = input.keys['ArrowRight'] || input.keys['KeyD'];
  if (left) player.x -= player.speed * dt;
  if (right) player.x += player.speed * dt;
  player.x = Math.max(0, Math.min(W - player.w, player.x));

  // Spawn blocks, faster as the score grows
  score += dt;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const size = 20 + Math.random() * 40;
    blocks.push({
      x: Math.random() * (W - size),
      y: -size,
      w: size,
      h: size,
      vy: 150 + Math.random() * 150 + score * 8,
    });
    spawnTimer = Math.max(0.15, 0.8 - score * 0.02);
  }

  // Move blocks and check collisions
  for (const b of blocks) {
    b.y += b.vy * dt;
    const hit =
      b.x < player.x + player.w &&
      b.x + b.w > player.x &&
      b.y < player.y + player.h &&
      b.y + b.h > player.y;
    if (hit) {
      gameOver = true;
      best = Math.max(best, score);
    }
  }
  blocks = blocks.filter(b => b.y < H);
}

function render(ctx) {
  // Background
  ctx.fillStyle = '#12141c';
  ctx.fillRect(0, 0, W, H);

  // Blocks
  ctx.fillStyle = '#ff5c5c';
  for (const b of blocks) ctx.fillRect(b.x, b.y, b.w, b.h);

  // Player
  ctx.fillStyle = gameOver ? '#777' : '#4fd1c5';
  ctx.fillRect(player.x, player.y, player.w, player.h);

  // HUD
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Time: ' + score.toFixed(1) + 's', 16, 30);
  ctx.textAlign = 'right';
  ctx.fillText('Best: ' + best.toFixed(1) + 's', W - 16, 30);

  if (gameOver) {
    ctx.textAlign = 'center';
    ctx.font = '48px sans-serif';
    ctx.fillText('Game Over', W / 2, H / 2 - 10);
    ctx.font = '22px sans-serif';
    ctx.fillText('Press Space to restart', W / 2, H / 2 + 30);
  }
}

registerGame({ init, update, render });