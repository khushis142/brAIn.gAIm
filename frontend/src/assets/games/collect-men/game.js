// collect-men/game.js: answer questions by choosing one of three lanes.
let gl, api, program, positionBuffer, colorBuffer;
let playerLane, previousKeys, worldZ, wallTimer, walls, score, gameOver;
let username, context, difficulty;
let questions, questionIndex, activeQuestion, feedback, feedbackTimer, ui;
const WORLD_SPEED = 4;

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
  context = api.data.context;
  difficulty = api.data.difficulty;
  questions = Array.isArray(api.data.questions) ? api.data.questions : [];
  if (!questions.length) throw new Error('Collect Men needs at least one question.');
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
  createUi();
  reset();
}

function reset() {
  playerLane = 0;
  previousKeys = {};
  worldZ = 0;
  wallTimer = 0;
  walls = [];
  score = 3;
  gameOver = false;
  questionIndex = 0;
  feedback = '';
  feedbackTimer = 0;
  activeQuestion = null;
  questions = shuffle([...questions]);
  nextQuestion();
}

function update(dt, input) {
  if (gameOver) return;
  const leftPressed = input.keys.ArrowLeft && !previousKeys.ArrowLeft;
  const rightPressed = input.keys.ArrowRight && !previousKeys.ArrowRight;
  if (leftPressed) playerLane = Math.max(-1, playerLane - 1);
  if (rightPressed) playerLane = Math.min(1, playerLane + 1);
  previousKeys = { ...input.keys };
  worldZ += WORLD_SPEED * dt;

  if (feedbackTimer > 0) {
    feedbackTimer -= dt;
    updateUi();
    if (feedbackTimer <= 0) nextQuestion();
    return;
  }
  wallTimer -= dt;

  if (wallTimer <= 0) {
    walls.push({ z: -18, answers: activeQuestion.answers, modifier: questionIndex });
    wallTimer = 10;
  }

  for (const wall of walls) wall.z += WORLD_SPEED * dt;
  for (let i = walls.length - 1; i >= 0; i--) {
    const wall = walls[i];
    if (wall.z > -0.8 && wall.z < 0.8) {
      resolveAnswer(wall.answers[playerLane + 1]);
      walls.splice(i, 1);
    } else if (wall.z > 3) {
      walls.splice(i, 1);
    }
  }
}

function nextQuestion() {
  if (questionIndex >= questions.length) {
    finishGame();
    return;
  }
  const question = questions[questionIndex++];
  const answers = [
    { text: question.answer_correct, correct: true },
    { text: question.answer_incorrect, correct: false },
    { text: question.answer_incorrect2, correct: false },
  ];
  shuffle(answers);
  activeQuestion = { question: question.question, answers, source: question };
  feedback = '';
  wallTimer = 0;
  updateUi();
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function resolveAnswer(answer) {
  const modifier = answer.correct ? `+${questionIndex}` : `-${questionIndex}`;
  applyModifier(modifier);
  if (!answer.correct) {
    const retryIndex = Math.floor(Math.random() * (questions.length + 1));
    questions.splice(retryIndex, 0, activeQuestion.source);
  }
  feedback = `${answer.correct ? 'correct' : 'incorrect'} ${modifier}`;
  feedbackTimer = 3;
  updateUi();
  if (score <= 0) finishGame();
}

function applyModifier(modifier) {
  score += Number(modifier);
}

function finishGame() {
  if (gameOver) return;
  gameOver = true;
  feedback = `Final score: ${Math.floor(score)}`;
  updateUi();
  api.submitResult({ score: Math.floor(score), game: 'collect-men', username, context, difficulty });
}

function createUi() {
  ui = document.createElement('div');
  ui.style.cssText =
    'position:fixed;inset:0;pointer-events:none;color:#fff;font:600 14px system-ui,sans-serif;text-align:center;text-shadow:0 2px 4px #000;z-index:2';
  document.body.appendChild(ui);
  updateUi();
}

function updateUi() {
  if (!ui || !activeQuestion) return;
  const answers = activeQuestion.answers
    .map((answer, index) => `<div style="flex:1;margin:0 4px;padding:8px 4px;border:1px solid ${index === playerLane + 1 ? '#fff' : '#668'};border-radius:8px;background:#18254ddd">${escapeHtml(answer.text)}</div>`)
    .join('');
  const heading = feedback || activeQuestion.question;
  const answerRow = feedback ? '' : `<div style="display:flex;margin-top:8px">${answers}</div>`;
  ui.innerHTML = `<div style="padding:12px 8px;margin:auto;max-width:680px"><div style="font-size:18px">${escapeHtml(heading)}</div>${answerRow}<div style="margin-top:8px;color:#ffe66d">Score: ${Math.floor(score)}</div></div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

function laneX(lane) {
  return lane * 2.2;
}

function render(context3d) {
  gl = context3d;
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.025, 0.04, 0.09, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (!program) setupGl();

  gl.useProgram(program);
  drawFigure([laneX(playerLane), 0, 0], [0.2, 0.8, 0.95]);
  for (const wall of walls) drawWall(wall);
  drawLanes();
  drawScore([laneX(playerLane), 2.1, 0]);
}

function setupGl() {
  program = createProgram(vertexSource, fragmentSource);
  positionBuffer = gl.createBuffer();
  colorBuffer = gl.createBuffer();
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

function drawFigure(center, color) {
  const [x, y, z] = center;
  drawCube([x, y + 0.65, z], 0.24, color);
  drawCube([x, y - 0.1, z], 0.42, color);
  drawCube([x - 0.27, y - 0.75, z], 0.12, color);
  drawCube([x + 0.27, y - 0.75, z], 0.12, color);
}

function drawWall(wall) {
  const colors = [
    [0.95, 0.45, 0.25],
    [0.55, 0.45, 0.95],
    [0.3, 0.85, 0.65],
  ];
  for (let lane = -1; lane <= 1; lane++) {
    const x = laneX(lane);
    drawBox([x, 0, wall.z], [0.92, 0.9, 0.16], colors[lane + 1]);
    drawNumber(wall.modifier, [x, 0, wall.z + 0.18]);
  }
}

function drawNumber(value, center) {
  const text = String(value);
  const startX = center[0] - (text.length - 1) * 0.32;
  for (let i = 0; i < text.length; i++) {
    drawDigit(text[i], [startX + i * 0.64, center[1], center[2]], [1, 0.95, 0.55]);
  }
}

function drawScore(center) {
  const text = String(Math.max(-99, Math.min(999, Math.floor(score))));
  const startX = center[0] - (text.length - 1) * 0.32;
  for (let i = 0; i < text.length; i++) {
    drawDigit(text[i], [startX + i * 0.64, center[1], center[2]], [1, 0.9, 0.25]);
  }
}

function drawDigit(value, center, color) {
  if (value === 'x') {
    drawBox([center[0] - 0.08, center[1] + 0.08, center[2]], [0.025, 0.13, 0.025], color);
    drawBox([center[0] + 0.08, center[1] + 0.08, center[2]], [0.025, 0.13, 0.025], color);
    drawBox([center[0] - 0.08, center[1] - 0.08, center[2]], [0.025, 0.13, 0.025], color);
    drawBox([center[0] + 0.08, center[1] - 0.08, center[2]], [0.025, 0.13, 0.025], color);
    return;
  }

  const segments = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g',
  }[value] ?? '';
  const positions = {
    a: [0, 0.24], b: [0.16, 0.12], c: [0.16, -0.12], d: [0, -0.24],
    e: [-0.16, -0.12], f: [-0.16, 0.12], g: [0, 0],
  };
  for (const segment of segments) {
    const [x, y] = positions[segment];
    const horizontal = ['a', 'd', 'g'].includes(segment);
    drawBox(
      [center[0] + x, center[1] + y, center[2]],
      horizontal ? [0.13, 0.025, 0.025] : [0.025, 0.13, 0.025],
      color,
    );
  }
}

function drawCube(center, size, color) {
  drawBox(center, [size, size, size], color);
}

function drawBox(center, halfSize, color) {
  const [x, y, z] = center;
  const [w, h, d] = halfSize;
  const vertices = cubeVertices(x, y, z, w, h, d);
  drawGeometry(vertices, Array(36).fill(color).flat());
}

function drawLanes() {
  const laneColor = [0.12, 0.22, 0.38];
  for (const lane of [-1, 0, 1]) {
    const vertices = cubeVertices(laneX(lane), -0.9, -5, 1, 0.08, 9);
    drawGeometry(vertices, Array(36).fill(laneColor).flat());
  }
  drawSideDecorations();
}

function drawSideDecorations() {
  const decorations = [
    { x: -4.2, z: -2, color: [0.95, 0.55, 0.2] },
    { x: 4.2, z: -5, color: [0.35, 0.8, 0.95] },
    { x: -4.2, z: -8, color: [0.35, 0.8, 0.95] },
    { x: 4.2, z: -11, color: [0.95, 0.55, 0.2] },
  ];

  for (const decoration of decorations) {
    const z = ((decoration.z + worldZ + 14) % 18) - 14;
    drawCube([decoration.x, -0.25, z], 0.35, decoration.color);
    drawCube([decoration.x, 0.65, z], 0.16, decoration.color);
  }
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

function drawGeometry(vertices, colors) {
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
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, identity());
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);
}

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

registerGame({ renderer: 'webgl', init, update, render });
