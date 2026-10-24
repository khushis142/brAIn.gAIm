// collect-men/game.js: answer questions by choosing one of three lanes.
let THREE, GLTFLoader, cloneModel, renderer, scene, camera, playerModel, playerModels, playerMixers, playerAnimation, sideDecorations, treeMixers, treeAnimation, laneModels, groundStripes, clock, api;
let playerLane, previousKeys, worldZ, wallTimer, walls, score, gameOver;
let username, context, difficulty;
const MODEL_URL = '/assets/games/collect-men/assets/Gingerbreadman.glb';
const TREE_MODEL_URL = '/assets/games/collect-men/assets/tree.glb';
const FLOOR_MODEL_URL = '/assets/games/collect-men/assets/floor.glb';
const SKYBOX_URLS = [
  '/assets/games/collect-men/assets/skybox/posx.jpg',
  '/assets/games/collect-men/assets/skybox/negx.jpg',
  '/assets/games/collect-men/assets/skybox/posy.jpg',
  '/assets/games/collect-men/assets/skybox/negy.jpg',
  '/assets/games/collect-men/assets/skybox/posz.jpg',
  '/assets/games/collect-men/assets/skybox/negz.jpg',
];
let questionBank, questions, questionIndex, activeQuestion, feedback, feedbackTimer, ui;
const WORLD_SPEED = 4;

function init(gameApi) {
  api = gameApi;
  username = api.username;
  context = api.data.context;
  difficulty = api.data.difficulty;
  questionBank = Array.isArray(api.data.questions) ? api.data.questions : [];
  if (!questionBank.length) throw new Error('Collect Men needs at least one question.');
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
  sideDecorations = [];
  treeMixers = [];
  laneModels = [];
  groundStripes = [];
  score = 3;
  playerModels = [];
  playerMixers = [];
  gameOver = false;
  questionIndex = 0;
  feedback = '';
  feedbackTimer = 0;
  activeQuestion = null;
  questions = shuffle([...questionBank]).slice(0, Math.min(3, questionBank.length));
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
    walls.push({
      z: -18,
      answers: activeQuestion.answers,
      questionNumber: questionIndex,
      modifier: questionIndex,
    });
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
  if (!questions.length) {
    finishGame();
    return;
  }
  const question = questions.shift();
  questionIndex += 1;
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
  const style = document.createElement('style');
  style.textContent = `
    @keyframes collectMenQuestionIn {
      from { opacity: 0; transform: translateY(-18px) scale(.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes collectMenAnswerIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes collectMenFeedback {
      0% { opacity: 0; transform: scale(.8); }
      65% { opacity: 1; transform: scale(1.08); }
      100% { transform: scale(1); }
    }
    .collect-men-question { animation: collectMenQuestionIn .45s ease-out both; }
    .collect-men-answer { animation: collectMenAnswerIn .35s ease-out both; }
    .collect-men-feedback { animation: collectMenFeedback .5s cubic-bezier(.2,.8,.2,1) both; color: #ffe66d; }
    .collect-men-score { transition: color .25s ease, transform .25s ease; }
  `;
  document.head.appendChild(style);
  document.body.appendChild(ui);
  updateUi();
}

function updateUi() {
  if (!ui || !activeQuestion) return;
  const answers = activeQuestion.answers
    .map((answer, index) => `<div class="collect-men-answer" style="animation-delay:${index * 70}ms;flex:1;margin:0 4px;padding:8px 4px;border:1px solid ${index === playerLane + 1 ? '#fff' : '#668'};border-radius:8px;background:linear-gradient(135deg,#243866ee,#111b35ee);box-shadow:0 4px 14px #0005">${escapeHtml(answer.text)}</div>`)
    .join('');
  const heading = feedback || activeQuestion.question;
  const answerRow = feedback ? '' : `<div style="display:flex;margin-top:8px">${answers}</div>`;
  ui.innerHTML = `<div style="padding:12px 8px;margin:auto;max-width:680px"><div class="${feedback ? 'collect-men-feedback' : 'collect-men-question'}" style="font-size:18px">${escapeHtml(heading)}</div>${answerRow}<div class="collect-men-score" style="margin-top:8px;color:#ffe66d">Score: ${Math.floor(score)}</div></div>`;
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
  if (!renderer) setupThree(context3d);
  if (!renderer) return;
  renderer.render(scene, camera);
}

function setupThree(context3d) {
  const canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({ canvas, context: context3d, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(api.width, api.height, false);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b19);
  camera = new THREE.PerspectiveCamera(60, api.width / api.height, 0.1, 100);
  camera.position.set(0, 4, 8);
  camera.lookAt(0, 0, -4);
  clock = new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0x9fc7ff, 0x18223d, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(2, 6, 4);
  scene.add(light);
  drawSceneGeometry();
  loadSkybox().catch((error) => window.parent.postMessage({
    type: 'error',
    message: `Could not load skybox: ${error.message}`,
  }, '*'));
  requestAsset(TREE_MODEL_URL)
    .then((modelUrl) => new GLTFLoader().load(modelUrl, (gltf) => {
      treeAnimation = gltf.animations[0] || null;
      createSideDecorations(gltf.scene);
    }))
    .catch((error) => window.parent.postMessage({
      type: 'error',
      message: `Could not load tree decorations: ${error.message}`,
    }, '*'));
  requestAsset(MODEL_URL)
    .then((modelUrl) => new GLTFLoader().load(modelUrl, (gltf) => {
      playerModel = gltf.scene;
      playerModel.scale.setScalar(0.1);
      playerModel.position.set(0, -0.85, 0);
      playerAnimation = gltf.animations[0] || null;
      syncPlayerCount();
    }))
    .catch((error) => window.parent.postMessage({
      type: 'error',
      message: `Could not load player model: ${error.message}`,
    }, '*'));
  requestAsset(FLOOR_MODEL_URL)
    .then((modelUrl) => new GLTFLoader().load(modelUrl, (gltf) => {
      createLaneModels(gltf.scene);
    }))
    .catch((error) => window.parent.postMessage({
      type: 'error',
      message: `Could not load lane model: ${error.message}`,
    }, '*'));
}

async function loadSkybox() {
  const imageUrls = await Promise.all(SKYBOX_URLS.map((path) => requestAsset(path)));
  const images = await Promise.all(imageUrls.map((url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not decode skybox image: ${url}`));
    image.src = url;
  })));
  const skybox = new THREE.CubeTexture(images);
  skybox.needsUpdate = true;
  scene.background = skybox;
}

function requestAsset(path) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.source !== window.parent || event.data?.path !== path) return;
      window.removeEventListener('message', onMessage);
      if (event.data.type === 'asset-error') {
        reject(new Error(event.data.message));
        return;
      }
      if (event.data.type !== 'asset-response' || !(event.data.data instanceof ArrayBuffer)) {
        reject(new Error('Invalid model response'));
        return;
      }
      resolve(URL.createObjectURL(new Blob([event.data.data], { type: 'model/gltf-binary' })));
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'asset-request', path }, '*');
  });
}

function syncPlayerCount() {
  if (!scene || !playerModel) return;
  const targetCount = Math.max(1, Math.floor(score));
  while (playerModels.length < targetCount) {
    const model = playerModels.length === 0 ? playerModel : cloneModel(playerModel);
    const isLead = playerModels.length === 0;
    const formation = isLead ? { x: 0, z: 0 } : getFormationOffset(playerModels.length);
    model.userData.collectMenOffsetX = formation.x;
    model.userData.collectMenOffsetZ = formation.z;
    model.position.set(
      laneX(playerLane) + model.userData.collectMenOffsetX,
      -0.85,
      model.userData.collectMenOffsetZ,
    );
    scene.add(model);
    playerModels.push(model);
    if (playerAnimation) {
      const playerMixer = new THREE.AnimationMixer(model);
      playerMixer.timeScale = 6;
      playerMixer.clipAction(playerAnimation).play();
      playerMixers.push(playerMixer);
    }
  }
  while (playerModels.length > targetCount) {
    const model = playerModels.pop();
    const playerMixer = playerMixers.pop();
    if (playerMixer) playerMixer.stopAllAction();
    model.removeFromParent();
  }
}

function getFormationOffset(modelIndex) {
  let row = 1;
  let rowStart = 1;
  while (modelIndex >= rowStart + row + 1) {
    rowStart += row + 1;
    row += 1;
  }
  const positionInRow = modelIndex - rowStart;
  const rowWidth = row + 1;
  return {
    x: (positionInRow - (rowWidth - 1) / 2) * 1.2,
    z: row * 1.5,
  };
}

function drawSceneGeometry() {
  const groundGeometry = new THREE.PlaneGeometry(40, 60, 24, 36);
  const groundPositions = groundGeometry.attributes.position;
  for (let vertex = 0; vertex < groundPositions.count; vertex += 1) {
    const x = groundPositions.getX(vertex);
    const z = groundPositions.getY(vertex);
    groundPositions.setZ(vertex, Math.sin(x * 0.55 + z * 0.18) * 0.08 + Math.cos(z * 0.4) * 0.05);
  }
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(
    groundGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -1.02, -8);
  scene.add(ground);

  const groundStripeMaterial = new THREE.MeshStandardMaterial({ color: 0x244436 });
  for (let z = -36; z < 22; z += 3) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(40, 0.015, 0.08), groundStripeMaterial);
    stripe.userData.collectMenBaseZ = z;
    stripe.position.set(0, -1, z);
    scene.add(stripe);
    groundStripes.push(stripe);
  }

}

function createLaneModels(floorTemplate) {
  const sourceBounds = new THREE.Box3().setFromObject(floorTemplate);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  if (sourceSize.x <= 0 || sourceSize.y <= 0 || sourceSize.z <= 0) {
    throw new Error('Lane model has invalid dimensions.');
  }
  for (const lane of [-1, 0, 1]) {
    const floor = cloneModel(floorTemplate);
    floor.scale.set(2 / sourceSize.x, 1, 60 / sourceSize.z);
    floor.position.set(
      laneX(lane) - sourceCenter.x * floor.scale.x,
      -0.9 - sourceCenter.y,
      -5 - sourceCenter.z * floor.scale.z,
    );
    floor.userData.collectMenLaneZ = floor.position.z;
    scene.add(floor);
    laneModels.push(floor);
  }
}

function createSideDecorations(treeTemplate) {
  for (let index = 0; index < 10; index += 1) {
    const decoration = cloneModel(treeTemplate);
    const side = index % 2 === 0 ? -1 : 1;
    decoration.userData.collectMenBaseZ = -index * 2 + Math.random() * 1.5;
    decoration.position.set(
      side * (4 + Math.random() * 1.5),
      -0.9,
      decoration.userData.collectMenBaseZ,
    );
    decoration.scale.setScalar(0.5 + Math.random() * 1.1);
    decoration.rotation.y = Math.random() * Math.PI * 2;
    scene.add(decoration);
    sideDecorations.push(decoration);
    if (treeAnimation) {
      const treeMixer = new THREE.AnimationMixer(decoration);
      treeMixer.timeScale = 1;
      treeMixer.clipAction(treeAnimation).play();
      treeMixers.push(treeMixer);
    }
  }
}

function drawWalls() {
  const activeMeshes = new Set();
  for (const wall of walls) {
    if (!wall.meshes) {
      wall.meshes = [-1, 0, 1].map((lane) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1.84, 1.8, 0.32),
          new THREE.MeshStandardMaterial({
            color: 0x3976b8,
            emissive: 0x102b58,
            emissiveIntensity: 1.2,
            roughness: 0.35,
            metalness: 0.35,
          }),
        );
        mesh.userData.collectMenWall = true;
        scene.add(mesh);
        return mesh;
      });
      const gateMaterial = new THREE.MeshStandardMaterial({
        color: 0xf4b942,
        emissive: 0x6b310d,
        emissiveIntensity: 1.4,
        metalness: 0.5,
        roughness: 0.25,
      });
      wall.gateParts = [
        new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.5, 0.5), gateMaterial),
        new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.5, 0.5), gateMaterial),
        new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.18, 0.5), gateMaterial),
      ];
      wall.gateParts.forEach((part) => {
        part.userData.collectMenWall = true;
        scene.add(part);
      });
      wall.label = createWallLabel(`Question ${wall.questionNumber}: worth ${wall.questionNumber} Points`);
      scene.add(wall.label);
    }
    wall.meshes.forEach((mesh, index) => {
      mesh.position.set(laneX(index - 1), 0, wall.z);
      mesh.visible = true;
      activeMeshes.add(mesh);
    });
    wall.gateParts[0].position.set(-3.3, 0.15, wall.z);
    wall.gateParts[1].position.set(3.3, 0.15, wall.z);
    wall.gateParts[2].position.set(0, 1.31, wall.z);
    wall.gateParts.forEach((part) => {
      part.visible = true;
      activeMeshes.add(part);
    });
    wall.label.position.set(0, 1.35, wall.z);
    wall.label.position.y = 1.35 + Math.sin(worldZ * 0.08) * 0.06;
    const labelPulse = 1 + Math.sin(worldZ * 0.12) * 0.02;
    wall.label.scale.set(6.4 * labelPulse, 0.88 * labelPulse, 1);
    wall.label.visible = true;
    activeMeshes.add(wall.label);
  }
  scene.traverse((object) => {
    if ((object.userData.collectMenWall || object.userData.collectMenWallLabel)
      && !activeMeshes.has(object)) object.visible = false;
  });
}

function createWallLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 220;
  const context2d = canvas.getContext('2d');
  context2d.font = 'bold 88px system-ui, sans-serif';
  context2d.textAlign = 'center';
  context2d.textBaseline = 'middle';
  context2d.lineJoin = 'round';
  context2d.lineWidth = 18;
  context2d.strokeStyle = '#ffffff';
  context2d.strokeText(text, canvas.width / 2, canvas.height / 2);
  context2d.fillStyle = '#000000';
  context2d.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  }));
  label.scale.set(6.4, 0.88, 1);
  label.userData.collectMenWallLabel = true;
  return label;
}

function animateThree(dt) {
  if (!scene) return;
  syncPlayerCount();
  for (const playerMixer of playerMixers) playerMixer.update(dt);
  for (const treeMixer of treeMixers) treeMixer.update(dt);
  playerModels.forEach((model, index) => {
    const targetX = laneX(playerLane) + model.userData.collectMenOffsetX;
    const targetZ = model.userData.collectMenOffsetZ;
    model.position.x += (targetX - model.position.x) * Math.min(1, dt * 12);
    model.position.z += (targetZ - model.position.z) * Math.min(1, dt * 12);
  });
  for (const decoration of sideDecorations) {
    decoration.position.z = ((decoration.userData.collectMenBaseZ + worldZ + 14) % 18) - 14;
  }
  for (const floor of laneModels) {
    floor.position.z += WORLD_SPEED * dt;
    if (floor.position.z > 25) floor.position.z -= 60;
  }
  drawWalls();
}

async function bootstrapThree() {
  const three = await import('https://esm.sh/three@0.180.0');
  const loader = await import('https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js');
  const skeletonUtils = await import('https://esm.sh/three@0.180.0/examples/jsm/utils/SkeletonUtils.js');
  THREE = three;
  GLTFLoader = loader.GLTFLoader;
  cloneModel = skeletonUtils.clone;
  registerGame({
    renderer: 'webgl',
    init,
    update(dt, input) {
      animateThree(dt);
      updateGame(dt, input);
    },
    render,
    destroy,
  });
}

function updateGame(dt, input) {
  update(dt, input);
}

function destroy() {
  if (ui) ui.remove();
  for (const playerMixer of playerMixers) playerMixer.stopAllAction();
  for (const treeMixer of treeMixers) treeMixer.stopAllAction();
  if (renderer) renderer.dispose();
  scene = null;
  playerModel = null;
  playerAnimation = null;
  playerModels = [];
  playerMixers = [];
  sideDecorations = [];
  treeMixers = [];
  treeAnimation = null;
  laneModels = [];
  groundStripes = [];
}

bootstrapThree().catch((error) => {
  throw new Error(`Three.js could not load: ${error.message}`);
});
