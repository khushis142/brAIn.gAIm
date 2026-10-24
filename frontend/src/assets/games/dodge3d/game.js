// dodge3d/game.js: steer a cube through falling obstacles. Arrow keys to move; on touch
// screens, hold the left or right half. The runtime only forwards keys, so the game listens
// for pointer events on its own canvas.
let gl, api, program, positionBuffer, colorBuffer, canvas;
let playerX, obstacles, spawnTimer, score, gameOver, previousKeys;
let username, difficulty, context;
let best = 0;
const touches = new Map(); // pointerId -> 'left' | 'right'

const vertexSource = `
attribute vec3 position;
attribute vec3 color;
uniform mat4 projection;
uniform mat4 view;
uniform mat4 model;
varying vec3 vertexColor;
void main() {
  vertexColor = color;
  gl_Position = projection * view * model * vec4(position, 1.0);
}`;

const fragmentSource = `
precision mediump float;
varying vec3 vertexColor;
void main() { gl_FragColor = vec4(vertexColor, 1.0); }`;

function init(gameApi) {
  api = gameApi;
  username = api.username;
  difficulty = api.data.difficulty;
  context = api.data.context;
  api.setUiDesign({
    theme: { accent: 'sky', panel: 'dark', density: 'comfortable' },
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

function destroy() {
  if (!canvas) return;
  canvas.removeEventListener('pointerdown', onPointer);
  canvas.removeEventListener('pointermove', onPointer);
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    canvas.removeEventListener(type, onPointerEnd);
  }
}

function reset() {
  playerX = 0;
  obstacles = [];
  spawnTimer = 0;
  score = 0;
  gameOver = false;
  previousKeys = {};
}

function update(dt, input) {
  previousKeys = { ...input.keys };
  if (gameOver) return;

  if (input.keys.ArrowLeft || touching('left')) playerX -= 2.8 * dt;
  if (input.keys.ArrowRight || touching('right')) playerX += 2.8 * dt;
  playerX = Math.max(-3, Math.min(3, playerX));
  score += dt;
  spawnTimer -= dt;

  if (spawnTimer <= 0) {
    const size = 0.45 + Math.random() * 0.35;
    obstacles.push({ x: -3 + Math.random() * 6, z: -12, size, speed: 3 + score * 0.08 + difficultyOffset() });
    spawnTimer = Math.max(0.35, 1 - score * 0.025);
  }

  for (const obstacle of obstacles) {
    obstacle.z += obstacle.speed * dt;
    if (Math.abs(obstacle.x - playerX) < obstacle.size + 0.45 && obstacle.z > -1 && obstacle.z < 1) {
      gameOver = true;
      best = Math.max(best, score);
      api.submitResult({
        score: Math.floor(score * 10),
        game: 'dodge3d',
        username,
        context,
        difficulty,
        survivedSeconds: Number(score.toFixed(2)),
      });
      break;
    }
  }
  obstacles = obstacles.filter((obstacle) => obstacle.z < 4);
}

function difficultyOffset() {
  if (difficulty === 'easy') return -0.4;
  if (difficulty === 'hard') return 1.2;
  return 0;
}

function render(context3d) {
  gl = context3d;
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.03, 0.05, 0.1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (!program) setupGl();

  gl.useProgram(program);
  drawCube([playerX, 0, 0], [0.8, 0.35, 0.8], [0.15, 0.85, 0.8]);
  for (const obstacle of obstacles) {
    const size = obstacle.size;
    drawCube([obstacle.x, 0, obstacle.z], [size, size, size], [0.95, 0.25, 0.35]);
  }
  drawGround();
}

function setupGl() {
  program = createProgram(vertexSource, fragmentSource);
  positionBuffer = gl.createBuffer();
  colorBuffer = gl.createBuffer();
  gl.enable(gl.DEPTH_TEST);
}

function createProgram(vertexCode, fragmentCode) {
  const vertex = compile(gl.VERTEX_SHADER, vertexCode);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentCode);
  const linked = gl.createProgram();
  gl.attachShader(linked, vertex);
  gl.attachShader(linked, fragment);
  gl.linkProgram(linked);
  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(linked));
  return linked;
}

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function drawCube(center, size, color) {
  const [x, y, z] = center;
  const [w, h, d] = size;
  const vertices = cubeVertices(x, y, z, w, h, d);
  const colors = Array(36).fill(color).flat();
  drawGeometry(vertices, colors, modelMatrix());
}

function drawGround() {
  drawGeometry([-4, -0.5, -14, 4, -0.5, -14, 4, -0.5, 4, -4, -0.5, 4],
    Array(12).fill([0.12, 0.18, 0.3]).flat(), modelMatrix());
}

function cubeVertices(x, y, z, w, h, d) {
  const x0 = x - w, x1 = x + w, y0 = y - h, y1 = y + h, z0 = z - d, z1 = z + d;
  return [
    x0,y0,z1, x1,y0,z1, x1,y1,z1, x0,y0,z1, x1,y1,z1, x0,y1,z1,
    x1,y0,z0, x0,y0,z0, x0,y1,z0, x1,y0,z0, x0,y1,z0, x1,y1,z0,
    x0,y0,z0, x0,y0,z1, x0,y1,z1, x0,y0,z0, x0,y1,z1, x0,y1,z0,
    x1,y0,z1, x1,y0,z0, x1,y1,z0, x1,y0,z1, x1,y1,z0, x1,y1,z1,
    x0,y1,z1, x1,y1,z1, x1,y1,z0, x0,y1,z1, x1,y1,z0, x0,y1,z0,
    x0,y0,z0, x1,y0,z0, x1,y0,z1, x0,y0,z0, x1,y0,z1, x0,y0,z1,
  ];
}

function drawGeometry(vertices, colors, model) {
  const position = gl.getAttribLocation(program, 'position');
  const color = gl.getAttribLocation(program, 'color');
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(color);
  gl.vertexAttribPointer(color, 3, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, perspective(Math.PI / 3, api.width / api.height, 0.1, 100));
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, lookAt([0, 4, 8], [0, 0, -4], [0, 1, 0]));
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);
}

function modelMatrix() { return identity(); }
function identity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function perspective(f, aspect, near, far) {
  const t = 1 / Math.tan(f / 2), r = 1 / (near - far);
  return [t/aspect,0,0,0, 0,t,0,0, 0,0,(far+near)*r,-1, 0,0,2*far*near*r,0];
}
function lookAt(eye, target, up) {
  const z = normalize(sub(eye, target)), x = normalize(cross(up, z)), y = cross(z, x);
  return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1];
}
function sub(a,b) { return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
function dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function normalize(v) { const l = Math.hypot(v[0],v[1],v[2]); return [v[0]/l,v[1]/l,v[2]/l]; }

registerGame({ renderer: 'webgl', init, update, render, destroy });
