/**
 * game-runtime.js
 *
 * Runs INSIDE the sandboxed iframe, before the game's own script.
 * Expects a <canvas id="c"> in the document.
 *
 * Game contract (what the game passes to registerGame):
 *   init(api)            required   api = { width, height, username, data, submitResult, setUiDesign }
 *   update(dt, input)    required   dt in seconds, input = { keys, pointer }
 *                         touch gestures also press virtual keys
 *   renderer             optional   '2d' (default) or 'webgl'
 *   api.performance      live frame metrics and adaptive quality state
 *   render(ctx)          required   CanvasRenderingContext2D or WebGLRenderingContext
 *   resize(w, h, viewport) optional called after the host resized the canvas
 *   destroy()            optional   called once when the game is stopped
 *
 * Messages to the host:   { type: 'started' | 'heartbeat' | 'result' | 'error', ... }
 * Commands from the host: { type: 'pause' | 'resume' | 'stop' | 'resize' | 'touch', ... }
 *
 * NOTE: This file is injected into the page as an inline script, so it must
 * never contain a closing script tag sequence anywhere, not even in comments.
 *
 * NOTE: The runtime shares a realm with the (untrusted) game code, so a
 * malicious game can tamper with it. The security boundary is the iframe
 * sandbox plus the CSP, not this file. The host must still validate every
 * message it receives.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- config
  const MAX_DT = 0.05;               // clamp huge frame gaps (tab switch, lag)
  const HEARTBEAT_MS = 500;          // how often we report "I'm alive"
  const STALL_MS = 2000;             // no frame for this long = loop is dead
  const REGISTER_TIMEOUT_MS = 3000;  // game must call registerGame() by then
    const EXECUTION_TIME_MS = 5 * 60 * 1000;
  const MAX_ERROR_LENGTH = 500;
  const MAX_CANVAS_SIZE = 4096;
    const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;
    const MAX_ASSETS = 32;
    const MAX_TOTAL_ASSET_BYTES = 32 * 1024 * 1024;
    const MAX_RESULT_BYTES = 32 * 1024;
    const MAX_UI_TEXT_LENGTH = 200;
    const MAX_UI_DESIGN_BYTES = 8 * 1024;
    const MAX_RESULT_SUBMISSIONS = 3;
  const MIN_QUALITY_SCALE = 0.5;
  const SLOW_FRAME_LIMIT = 8;
  const REQUIRED_HOOKS = ['init', 'update', 'render'];
  const GAME_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  ]);
  const GAMEPAD_BUTTON_KEYS = new Map([
    [0, 'Space'], [12, 'ArrowUp'], [13, 'ArrowDown'],
    [14, 'ArrowLeft'], [15, 'ArrowRight'],
  ]);
  const GAMEPAD_AXIS_DEADZONE = 0.5;
  const ASSET_LIMITS = Object.freeze({
    image: 5 * 1024 * 1024,
    audio: 10 * 1024 * 1024,
    font: 2 * 1024 * 1024,
    model: 15 * 1024 * 1024,
  });

  // ---------------------------------------------------------------- helpers
  // '*' is required: a sandboxed iframe without allow-same-origin has an
  // opaque origin, so there is no concrete target origin to name.
  const post = (message) => parent.postMessage(message, '*');

  const describe = (err) => {
    const text = err instanceof Error ? (err.message || err.name) : String(err);
    return (text || 'Unknown error').slice(0, MAX_ERROR_LENGTH);
  };

  const canvas = document.getElementById('c');
  if (!canvas) {
    post({ type: 'error', message: 'Runtime: canvas #c not found' });
    return;
  }
  // ---------------------------------------------------------------- state
  let game = null;
  let ctx = null;
  let renderer = '2d';
  let registered = false;
  let failed = false;
  let stopped = false;
  let hostPaused = false;
  let contextLost = false;
  let rafId = 0;
  let last = performance.now();
  let lastFrame = last;
  let registerTimer;
  let heartbeatTimer;
    let executionTimer;
    let resultSubmissions = 0;
  let performanceConfig = null;
  let qualityScale = 1;
  let frameTime = 0;
  let averageFrameTime = 0;
  let slowFrameCount = 0;
  let webglCapabilities = Object.freeze({
    available: false,
    webgl2: false,
    maxTextureSize: 0,
    maxViewportDimensions: [0, 0],
    antialias: false,
    highPerformance: false,
    renderer: '',
  });

  const pointer = {
    x: 0,
    y: 0,
    normalizedX: 0,
    normalizedY: 0,
    down: false,
    justPressed: false,
    justReleased: false,
    deltaX: 0,
    deltaY: 0,
  };
  let viewport = null;
  const keySources = {
    keyboard: {},
    touch: {},
    gamepad: {},
  };
  const keyStates = {};
  for (const code of GAME_KEYS) {
    keyStates[code] = { held: false, justPressed: false, justReleased: false };
  }
  const input = { keys: keyStates, pointer };
  const gameInput = window.__GAME_INPUT__;
  delete window.__GAME_INPUT__;

  if (gameInput === null || typeof gameInput !== 'object' ||
      gameInput.protocolVersion !== 2 || typeof gameInput.username !== 'string' ||
      gameInput.data === null || typeof gameInput.data !== 'object' ||
      typeof gameInput.data.context !== 'string' ||
      gameInput.data.context.trim().length === 0) {
    post({ type: 'error', message: 'Runtime: game input must include a context string' });
    return;
  }

  const requestedPerformance = gameInput.performance && typeof gameInput.performance === 'object'
    ? gameInput.performance : {};
  performanceConfig = Object.freeze({
    targetFps: requestedPerformance.targetFps === 30 ? 30 : 60,
    adaptiveQuality: requestedPerformance.adaptiveQuality !== false,
    maxPixelRatio: Math.min(Math.max(Number(requestedPerformance.maxPixelRatio) || 2, 1), 4),
    reducedEffects: requestedPerformance.reducedEffects === true,
  });

  const assetManifest = gameInput.assets && typeof gameInput.assets === 'object' &&
    !Array.isArray(gameInput.assets) ? gameInput.assets : {};
  if (Object.keys(assetManifest).length > MAX_ASSETS) {
    post({ type: 'error', message: 'Runtime: asset count exceeds the budget' });
    return;
  }
  const assetCache = new Map();
  const assetPending = new Map();
  const assetProgress = { loaded: 0, total: 0, bytesLoaded: 0, bytesTotal: 0 };
  const assetEntries = new Map();

  for (const [id, definition] of Object.entries(assetManifest)) {
      const totalAssetBytes = [...assetEntries.values()].reduce((total, entry) => total + entry.maxBytes, 0);
      if (totalAssetBytes > MAX_TOTAL_ASSET_BYTES) {
        post({ type: 'error', message: 'Runtime: asset byte budget exceeded' });
        return;
      }
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(id) || definition === null ||
        typeof definition !== 'object' ||
        !['image', 'audio', 'font', 'model'].includes(definition.kind) ||
        typeof definition.url !== 'string') continue;
    try {
      const url = new URL(definition.url);
      if (url.protocol !== 'https:') continue;
      const hardLimit = ASSET_LIMITS[definition.kind];
      const maxBytes = Math.min(
        hardLimit,
        Number.isFinite(definition.maxBytes) && definition.maxBytes > 0
          ? definition.maxBytes : hardLimit,
      );
      assetEntries.set(id, Object.freeze({
        kind: definition.kind,
        url: url.href,
        maxBytes,
        preload: definition.preload === true,
      }));
    } catch (_) {
      // Invalid manifest entries are unavailable and never fetched.
    }
  }

  const addAssetProgress = (id) => {
    if (assetProgress.total === 0 || !assetPending.has(id)) {
      assetProgress.total += 1;
      const definition = assetEntries.get(id);
      assetProgress.bytesTotal += definition?.maxBytes || 0;
    }
  };

  const materializeAsset = async (definition, bytes) => {
    const blob = new Blob([bytes]);
    if (definition.kind === 'model') return bytes;
    const objectUrl = URL.createObjectURL(blob);
    try {
      if (definition.kind === 'image') {
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        return image;
      }
      if (definition.kind === 'audio') {
        const audio = new Audio(objectUrl);
        audio.preload = 'auto';
        await new Promise((resolve, reject) => {
          audio.addEventListener('canplaythrough', resolve, { once: true });
          audio.addEventListener('error', reject, { once: true });
          audio.load();
        });
        return audio;
      }
      const font = new FontFace(`game-asset-${definition.url}`, bytes);
      await font.load();
      document.fonts.add(font);
      return true;
    } finally {
      if (definition.kind !== 'audio') URL.revokeObjectURL(objectUrl);
    }
  };

  const readLimitedBody = async (response, maxBytes) => {
    const reader = response.body?.getReader();
    if (!reader) {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > maxBytes) throw new Error('asset is too large');
      return bytes;
    }
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error('asset is too large');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  };

  const loadAsset = (id, expectedKind) => {
    if (typeof id !== 'string' || !assetEntries.has(id) || assetEntries.get(id).kind !== expectedKind) {
      return Promise.resolve(expectedKind === 'font' ? false : null);
    }
    if (assetCache.has(id)) return Promise.resolve(assetCache.get(id));
    if (assetPending.has(id)) return assetPending.get(id);
    const definition = assetEntries.get(id);
    addAssetProgress(id);
    const promise = fetch(definition.url, { credentials: 'omit' })
      .then((response) => {
        if (!response.ok) throw new Error('asset request failed');
        const declaredLength = Number(response.headers.get('content-length'));
        if (declaredLength > definition.maxBytes) throw new Error('asset is too large');
        return readLimitedBody(response, definition.maxBytes);
      })
      .then((bytes) => {
        if (bytes.byteLength > definition.maxBytes) throw new Error('asset is too large');
        assetProgress.bytesLoaded += bytes.byteLength;
        return materializeAsset(definition, bytes);
      })
      .catch(() => expectedKind === 'font' ? false : null)
      .then((asset) => {
        assetCache.set(id, asset);
        assetProgress.loaded += 1;
        assetPending.delete(id);
        return asset;
      });
    assetPending.set(id, promise);
    return promise;
  };

  const assets = Object.freeze({
    progress: Object.freeze({
      get loaded() { return assetProgress.loaded; },
      get total() { return assetProgress.total; },
      get bytesLoaded() { return assetProgress.bytesLoaded; },
      get bytesTotal() { return assetProgress.bytesTotal; },
    }),
    loadImage: (id) => loadAsset(id, 'image'),
    loadAudio: (id) => loadAsset(id, 'audio'),
    loadFont: (id) => loadAsset(id, 'font'),
    loadModel: (id) => loadAsset(id, 'model'),
    preload: async (ids) => {
      const requested = ids === undefined
        ? [...assetEntries].filter(([, definition]) => definition.preload).map(([id]) => id)
        : [...ids];
      await Promise.all(requested.map((id) => {
        const definition = assetEntries.get(id);
        return definition ? loadAsset(id, definition.kind) : Promise.resolve(null);
      }));
    },
  });

  // Begin manifest-declared preloads immediately; games can await api.assets.preload().
  assets.preload();

  function readSafeArea() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const inset = {
      top: Number.parseFloat(style.paddingTop) || 0,
      right: Number.parseFloat(style.paddingRight) || 0,
      bottom: Number.parseFloat(style.paddingBottom) || 0,
      left: Number.parseFloat(style.paddingLeft) || 0,
    };
    probe.remove();
    return inset;
  }

  function createViewport(width, height) {
    const devicePixelRatio = Math.min(
      Math.max(window.devicePixelRatio || 1, 1),
      performanceConfig.maxPixelRatio,
    ) * qualityScale;
    const pixelWidth = Math.max(1, Math.min(MAX_CANVAS_SIZE,
      Math.round(width * devicePixelRatio)));
    const pixelHeight = Math.max(1, Math.min(MAX_CANVAS_SIZE,
      Math.round(height * devicePixelRatio)));
    if (pixelWidth * pixelHeight > MAX_CANVAS_PIXELS) {
      throw new Error('Canvas backing store exceeds the memory budget');
    }
    return Object.freeze({
      width,
      height,
      pixelWidth,
      pixelHeight,
      devicePixelRatio,
      orientation: width >= height ? 'landscape' : 'portrait',
      safeArea: Object.freeze(readSafeArea()),
    });
  }

  function applyViewport(width, height, notifyGame) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return;
    const next = createViewport(Math.floor(width), Math.floor(height));
    if (viewport && next.width === viewport.width && next.height === viewport.height &&
        next.pixelWidth === viewport.pixelWidth && next.pixelHeight === viewport.pixelHeight &&
        JSON.stringify(next.safeArea) === JSON.stringify(viewport.safeArea)) return;
    viewport = next;
    canvas.style.width = `${next.width}px`;
    canvas.style.height = `${next.height}px`;
    canvas.width = next.pixelWidth;
    canvas.height = next.pixelHeight;
    if (notifyGame && game && typeof game.resize === 'function') {
      try {
        game.resize(next.width, next.height, next);
      } catch (err) {
        fail(err);
      }
    }
  }

  // Getters so dimensions and viewport reflect later resizes.
  const api = Object.freeze({
    get width() { return viewport.width; },
    get height() { return viewport.height; },
    get viewport() { return viewport; },
    username: typeof gameInput.username === 'string' ? gameInput.username : '',
    data: gameInput.data,
    get renderer() { return renderer; },
    performance: Object.freeze({
      get targetFps() { return performanceConfig.targetFps; },
      get adaptiveQuality() { return performanceConfig.adaptiveQuality; },
      get reducedEffects() { return performanceConfig.reducedEffects || qualityScale < 1; },
      get frameTime() { return frameTime; },
      get averageFrameTime() { return averageFrameTime; },
      get qualityScale() { return qualityScale; },
    }),
    assets,
    webgl: Object.freeze({
      get capabilities() { return webglCapabilities; },
      createBasicScene,
    }),
    submitResult(result) {
      if (result === null || typeof result !== 'object' ||
          typeof result.score !== 'number' || !Number.isFinite(result.score)) {
        throw new Error('submitResult() expects an object with a finite score');
      }
      if (++resultSubmissions > MAX_RESULT_SUBMISSIONS) {
        fail(new Error('Result submission budget exceeded'));
        return;
      }
      let resultBytes;
      try {
        resultBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
      } catch (_) {
        throw new Error('submitResult() expects JSON-compatible data');
      }
      if (resultBytes > MAX_RESULT_BYTES) {
        fail(new Error('Result exceeds the size budget'));
        return;
      }
      // A submitted result ends gameplay. Do not let the execution budget
      // turn a long-lived result screen into a timeout error.
      clearTimeout(executionTimer);
      executionTimer = undefined;
      post({ type: 'result', result });
    },
    setUiDesign(design) {
      const validSection = (section) => {
        if (section === undefined) return true;
        return section !== null && typeof section === 'object' && !Array.isArray(section) &&
          typeof section.title === 'string' &&
          (section.message === undefined || typeof section.message === 'string') &&
          (section.resumeLabel === undefined || typeof section.resumeLabel === 'string') &&
          (section.subtitle === undefined || typeof section.subtitle === 'string') &&
          (section.scoreLabel === undefined || typeof section.scoreLabel === 'string');
      };
      const validTheme = (theme) => theme === undefined || (theme !== null &&
        typeof theme === 'object' && !Array.isArray(theme) &&
        (theme.accent === undefined || ['teal', 'amber', 'rose', 'sky'].includes(theme.accent)) &&
        (theme.panel === undefined || ['dark', 'light'].includes(theme.panel)) &&
        (theme.density === undefined || ['compact', 'comfortable'].includes(theme.density)));
      if (design === null || typeof design !== 'object' ||
          !validTheme(design.theme) ||
          !validSection(design.pauseMenu) || !validSection(design.leaderboard)) {
        throw new Error('setUiDesign() expects a design object');
      }
      const sections = [design.pauseMenu, design.leaderboard];
      const text = sections.flatMap((section) => section ?
        [section.title, section.message, section.resumeLabel, section.subtitle, section.scoreLabel] : []);
      if (text.some((item) => item !== undefined && item.length > MAX_UI_TEXT_LENGTH) ||
          new TextEncoder().encode(JSON.stringify(design)).byteLength > MAX_UI_DESIGN_BYTES) {
        fail(new Error('UI text exceeds the size budget'));
        return;
      }
      post({ type: 'ui-design', design });
    },
  });

  function createContext(selectedRenderer) {
    if (selectedRenderer === 'webgl') {
      return canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' }) ||
        canvas.getContext('webgl', { antialias: true, powerPreference: 'high-performance' });
    }
    return canvas.getContext('2d');
  }

  function readWebGlCapabilities(gl) {
    if (!gl) return webglCapabilities;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
      : gl.getParameter(gl.RENDERER) || '';
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [0, 0];
    return Object.freeze({
      available: true,
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0,
      maxViewportDimensions: [maxViewport[0] || 0, maxViewport[1] || 0],
      antialias: Boolean(gl.getContextAttributes?.().antialias),
      highPerformance: /angle|swiftshader|llvmpipe|software/i.test(rendererName) === false,
      renderer: String(rendererName),
    });
  }

  function createBasicScene() {
    if (renderer !== 'webgl' || !ctx) return null;
    const gl = ctx;
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return null;
    gl.shaderSource(vertexShader, 'attribute vec3 p; uniform mat4 m; void main(){gl_Position=m*vec4(p,1.0);}');
    gl.shaderSource(fragmentShader, 'precision mediump float; uniform vec4 u; void main(){gl_FragColor=u;}');
    gl.compileShader(vertexShader);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    const vertices = new Float32Array([
      -1,-1,-1, 1,0,0,1, 1,-1,-1, 0,1,0,1, 1,1,-1, 0,0,1,1, -1,1,-1, 1,1,0,1,
      -1,-1,1, 1,0,1,1, 1,-1,1, 0,1,1,1, 1,1,1, 1,1,1,1, -1,1,1, 0,0,0,1,
    ]);
    const indices = new Uint16Array([
      0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1,
      3,2,6, 3,6,7, 1,5,6, 1,6,2, 0,3,7, 0,7,4,
    ]);
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vertexBuffer || !indexBuffer) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p');
    const boxColor = gl.getUniformLocation(program, 'u');
    const matrix = gl.getUniformLocation(program, 'm');
    const boxes = [];
    const camera = { x: 0, y: 0, z: 5, fov: 60 };
    const multiply = (a, b) => {
      const out = new Float32Array(16);
      for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
        out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] +
          a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
      }
      return out;
    };
    const perspective = (aspect) => {
      const f = 1 / Math.tan(camera.fov * Math.PI / 360);
      const out = new Float32Array(16);
      out[0] = f / aspect; out[5] = f; out[10] = -1; out[11] = -1; out[14] = -0.2;
      return out;
    };
    const render = (timeSeconds = 0) => {
      gl.useProgram(program);
      gl.enable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 28, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      const projection = perspective(canvas.width / Math.max(1, canvas.height));
      for (const box of boxes) {
        const c = Math.cos((box.rotation || 0) + timeSeconds * 0.2);
        const s = Math.sin((box.rotation || 0) + timeSeconds * 0.2);
        const model = new Float32Array([c*box.size,0,-s*box.size,0, 0,box.size,0,0, s*box.size,0,c*box.size,0, box.x,box.y,box.z,1]);
        const view = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, -camera.x,-camera.y,-camera.z,1]);
        gl.uniformMatrix4fv(matrix, false, multiply(projection, multiply(view, model)));
        gl.uniform4fv(boxColor, box.color);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      }
    };
    return {
      camera,
      addBox(box = {}) {
        const item = { x: box.x || 0, y: box.y || 0, z: box.z || 0, size: box.size || 1, color: [...(box.color || [1, 1, 1, 1])], rotation: 0 };
        boxes.push(item);
        return item;
      },
      render,
      clear() { boxes.length = 0; },
    };
  }

  // ---------------------------------------------------------------- input
  // Mutate in place so a game holding a reference to input.keys stays valid.
  const clearKeys = () => {
    for (const source of Object.values(keySources)) {
      for (const code of Object.keys(source)) delete source[code];
    }
  };

  const setSourceKey = (source, code, held) => {
    if (!GAME_KEYS.has(code)) return;
    source[code] = held;
  };

  const updateGamepadKeys = () => {
    const next = {};
    for (const gamepad of navigator.getGamepads?.() || []) {
      if (!gamepad || !gamepad.connected) continue;
      for (const [buttonIndex, code] of GAMEPAD_BUTTON_KEYS) {
        if (gamepad.buttons[buttonIndex]?.pressed) next[code] = true;
      }
      if ((gamepad.axes[1] || 0) < -GAMEPAD_AXIS_DEADZONE) next.ArrowUp = true;
      if ((gamepad.axes[1] || 0) > GAMEPAD_AXIS_DEADZONE) next.ArrowDown = true;
      if ((gamepad.axes[0] || 0) < -GAMEPAD_AXIS_DEADZONE) next.ArrowLeft = true;
      if ((gamepad.axes[0] || 0) > GAMEPAD_AXIS_DEADZONE) next.ArrowRight = true;
    }
    for (const code of Object.keys(keySources.gamepad)) {
      if (!next[code]) delete keySources.gamepad[code];
    }
    Object.assign(keySources.gamepad, next);
  };

  const updateKeyStates = () => {
    updateGamepadKeys();
    const codes = new Set([
      ...Object.keys(keyStates),
      ...Object.keys(keySources.keyboard),
      ...Object.keys(keySources.touch),
      ...Object.keys(keySources.gamepad),
    ]);
    for (const code of codes) {
      const previous = keyStates[code]?.held === true;
      const held = Boolean(keySources.keyboard[code] || keySources.touch[code] || keySources.gamepad[code]);
      keyStates[code] = {
        held,
        justPressed: held && !previous,
        justReleased: !held && previous,
      };
    }
  };

  const updatePointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    if (!viewport || rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(0, Math.min(viewport.width,
      (event.clientX - rect.left) * viewport.width / rect.width));
    const y = Math.max(0, Math.min(viewport.height,
      (event.clientY - rect.top) * viewport.height / rect.height));
    pointer.deltaX += x - pointer.x;
    pointer.deltaY += y - pointer.y;
    pointer.x = x;
    pointer.y = y;
    pointer.normalizedX = viewport.width ? x / viewport.width : 0;
    pointer.normalizedY = viewport.height ? y / viewport.height : 0;
  };

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    try { window.focus(); } catch (_) {}
    updatePointer(event);
    pointer.down = true;
    pointer.justPressed = true;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pointer.down) event.preventDefault();
    updatePointer(event);
  });
  const releasePointer = (event) => {
    event.preventDefault();
    updatePointer(event);
    pointer.down = false;
    pointer.justReleased = true;
  };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault(); // no page scrolling
    setSourceKey(keySources.keyboard, e.code, true);
  });
  addEventListener('keyup', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    setSourceKey(keySources.keyboard, e.code, false);
  });
  // Without this, a key held while focus is lost would stay "pressed" forever.
  addEventListener('blur', () => {
    clearKeys();
    if (pointer.down) pointer.justReleased = true;
    pointer.down = false;
  });

  // ---------------------------------------------------------------- touch
  // Phones have no keyboard, so touch gestures press the same virtual keys.
  // Games keep reading input.keys and work with both:
  //   tap              Space, pressed briefly
  //   swipe            arrow key in the swipe direction, pressed briefly
  //   press and hold   ArrowLeft / ArrowRight held, by which half the finger is on
  const TAP_MAX_MOVE_PX = 12;
  const SWIPE_MIN_PX = 30;
  const HOLD_MS = 200;
  const BRIEF_PRESS_MS = 100;        // long enough for games that react to key edges

  let touch = null;                  // the one finger we follow

  const pressBriefly = (code) => {
    setSourceKey(keySources.touch, code, true);
    setTimeout(() => setSourceKey(keySources.touch, code, false), BRIEF_PRESS_MS);
  };

  const sideKey = (x) => (x < innerWidth / 2 ? 'ArrowLeft' : 'ArrowRight');

  const setHoldKey = (code) => {
    if (touch.holdKey === code) return;
    if (touch.holdKey) setSourceKey(keySources.touch, touch.holdKey, false);
    touch.holdKey = code;
    if (code) setSourceKey(keySources.touch, code, true);
  };

  // Touches arrive here directly, or from the host as 'touch' commands (see below)
  // when the browser delivered them to the host page instead.
  function touchStart(id, x, y) {
    if (touch) return;
    const current = { id, startX: x, startY: y, x, y, holdKey: null, holdTimer: 0 };
    touch = current;
    current.holdTimer = setTimeout(() => {
      // A finger that stayed put is holding; one that moved away is swiping
      const moved = Math.hypot(current.x - current.startX, current.y - current.startY);
      if (touch === current && moved < SWIPE_MIN_PX) setHoldKey(sideKey(current.x));
    }, HOLD_MS);
  }

  function touchMove(id, x, y) {
    if (!touch || touch.id !== id) return;
    touch.x = x;
    touch.y = y;
    if (touch.holdKey) setHoldKey(sideKey(x)); // dragging across switches direction
  }

  function touchEnd(id, x, y, cancelled) {
    if (!touch || touch.id !== id) return;
    clearTimeout(touch.holdTimer);
    const dx = x - touch.startX;
    const dy = y - touch.startY;
    const wasHold = touch.holdKey !== null;
    setHoldKey(null);
    touch = null;
    if (wasHold || cancelled) return;

    if (Math.abs(dx) < TAP_MAX_MOVE_PX && Math.abs(dy) < TAP_MAX_MOVE_PX) {
      pressBriefly('Space');
    } else if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_MIN_PX) {
      if (Math.abs(dx) > Math.abs(dy)) pressBriefly(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
      else pressBriefly(dy > 0 ? 'ArrowDown' : 'ArrowUp');
    }
  }

  addEventListener('touchstart', (e) => {
    e.preventDefault(); // no scrolling, zooming or emulated mouse clicks
    const t = e.changedTouches[0];
    touchStart(t.identifier, t.clientX, t.clientY);
  }, { passive: false });

  addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) touchMove(t.identifier, t.clientX, t.clientY);
  }, { passive: false });

  const onTouchEnd = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      touchEnd(t.identifier, t.clientX, t.clientY, e.type === 'touchcancel');
    }
  };
  addEventListener('touchend', onTouchEnd, { passive: false });
  addEventListener('touchcancel', onTouchEnd, { passive: false });

  // ---------------------------------------------------------------- loop
  const shouldRun = () =>
    game !== null && !failed && !stopped && !hostPaused && !contextLost && !document.hidden;

  function frame(now) {
    rafId = 0;
    if (!shouldRun()) return;
    rafId = requestAnimationFrame(frame);

    const targetFrameTime = 1000 / performanceConfig.targetFps;
    if (now - last < targetFrameTime - 1) return;

    const dt = Math.min(Math.max((now - last) / 1000, 0), MAX_DT);
    last = now;
    lastFrame = performance.now();
    const startedAt = performance.now();

    try {
      updateKeyStates();
      game.update(dt, input);

      pointer.justPressed = false;
      pointer.justReleased = false;
      pointer.deltaX = 0;
      pointer.deltaY = 0;

      if (renderer === '2d') {
        ctx.setTransform(viewport.devicePixelRatio, 0, 0, viewport.devicePixelRatio, 0, 0);
        ctx.clearRect(0, 0, viewport.width, viewport.height);
        ctx.save();
        try {
          game.render(ctx);
        } finally {
          ctx.restore(); // a game cannot leak transforms/styles into the next frame
        }
      } else {
        ctx.viewport(0, 0, canvas.width, canvas.height);
        ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
        game.render(ctx);
      }
      frameTime = performance.now() - startedAt;
      averageFrameTime = averageFrameTime === 0
        ? frameTime
        : averageFrameTime * 0.9 + frameTime * 0.1;
      if (performanceConfig.adaptiveQuality) {
        if (frameTime > targetFrameTime * 1.25) slowFrameCount += 1;
        else slowFrameCount = Math.max(0, slowFrameCount - 1);
        if (slowFrameCount >= SLOW_FRAME_LIMIT && qualityScale > MIN_QUALITY_SCALE) {
          qualityScale = Math.max(MIN_QUALITY_SCALE, qualityScale * 0.85);
          slowFrameCount = 0;
          applyViewport(viewport.width, viewport.height, true);
        }
      }
    } catch (err) {
      fail(err);
    }
  }

  // Starts or stops requestAnimationFrame so it matches the current state.
  function syncLoop() {
    if (shouldRun()) {
      if (!rafId) {
        last = performance.now(); // avoid a huge dt after resuming
        lastFrame = last;
        rafId = requestAnimationFrame(frame);
      }
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  document.addEventListener('visibilitychange', () => {
    clearKeys();
    syncLoop();
  });

  const syncViewport = () => {
    if (!viewport) return;
    applyViewport(canvas.clientWidth || viewport.width, canvas.clientHeight || viewport.height, true);
  };
  addEventListener('resize', syncViewport);
  addEventListener('orientationchange', syncViewport);
  window.visualViewport?.addEventListener('resize', syncViewport);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(syncViewport).observe(canvas);
  }

  // ---------------------------------------------------------------- lifecycle
  function shutdown() {
    if (stopped) return;
    stopped = true;
    syncLoop();
    clearInterval(heartbeatTimer);
    clearTimeout(registerTimer);
      clearTimeout(executionTimer);
    try {
      if (game && typeof game.destroy === 'function') game.destroy();
    } catch (_) {
      /* the game is going away anyway */
    }
  }

  function fail(err) {
    if (failed) return; // report only the first error
    failed = true;
    post({ type: 'error', message: describe(err) });
    shutdown();
  }

  function registerGame(candidate) {
    if (failed || stopped) return;
    if (registered) {
      fail(new Error('registerGame() was called more than once'));
      return;
    }
    registered = true;
    clearTimeout(registerTimer);

    if (candidate === null || typeof candidate !== 'object') {
      fail(new Error('registerGame() expects an object'));
      return;
    }
    if (candidate.renderer !== undefined && candidate.renderer !== '2d' && candidate.renderer !== 'webgl') {
      fail(new Error('Game renderer must be "2d" or "webgl"'));
      return;
    }
    const missing = REQUIRED_HOOKS.filter((n) => typeof candidate[n] !== 'function');
    if (missing.length > 0) {
      fail(new Error('Game is missing required function(s): ' + missing.join(', ')));
      return;
    }
    for (const name of ['destroy', 'resize', 'contextLost', 'contextRestored']) {
      if (candidate[name] !== undefined && typeof candidate[name] !== 'function') {
        fail(new Error('Game hook "' + name + '" must be a function'));
        return;
      }
    }

    renderer = candidate.renderer || '2d';
    applyViewport(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height, false);
    ctx = createContext(renderer);
    if (!ctx) {
      fail(new Error('Runtime: ' + renderer + ' context not available'));
      return;
    }
    if (renderer === 'webgl') {
      webglCapabilities = readWebGlCapabilities(ctx);
      canvas.addEventListener('webglcontextlost', onWebGlContextLost);
      canvas.addEventListener('webglcontextrestored', onWebGlContextRestored);
    }

    game = candidate;
    try {
      game.init(api);
    } catch (err) {
      fail(err);
      return;
    }

    post({ type: 'started' });
    syncLoop();
  }

  function onWebGlContextLost(event) {
    event.preventDefault();
    contextLost = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    try {
      game?.contextLost?.();
    } catch (err) {
      fail(err);
    }
  }

  function onWebGlContextRestored() {
    if (failed || stopped || renderer !== 'webgl') return;
    ctx = createContext(renderer);
    if (!ctx) {
      fail(new Error('WebGL context could not be restored'));
      return;
    }
    webglCapabilities = readWebGlCapabilities(ctx);
    contextLost = false;
    applyViewport(viewport.width, viewport.height, true);
    try {
      game?.contextRestored?.(api);
    } catch (err) {
      fail(err);
      return;
    }
    syncLoop();
  }

  // Not writable, so the game cannot swap it out later.
  Object.defineProperty(window, 'registerGame', {
    value: registerGame,
    writable: false,
    configurable: false,
  });

  // ---------------------------------------------------------------- errors
  // Also catches syntax errors in the game script, which try/catch cannot.
  addEventListener('error', (e) => fail(e.error || e.message));
  addEventListener('unhandledrejection', (e) => fail(e.reason));

  registerTimer = setTimeout(() => {
    if (!registered) {
      fail(new Error('Game did not call registerGame() within ' +
        REGISTER_TIMEOUT_MS / 1000 + 's'));
    }
  }, REGISTER_TIMEOUT_MS);
  executionTimer = setTimeout(() => {
    if (game && !stopped && !failed && resultSubmissions === 0) {
      fail(new Error('Execution time budget exceeded'));
    }
  }, EXECUTION_TIME_MS);

  // ---------------------------------------------------------------- heartbeat
  // Only sent while things are healthy. If the loop should be running but no
  // frame has been drawn for STALL_MS, we stay silent and the host's watchdog
  // takes over. A paused or hidden game is healthy, so it keeps beating.
  heartbeatTimer = setInterval(() => {
    if (failed || stopped) return;
    const loopHealthy =
      !shouldRun() || performance.now() - lastFrame < STALL_MS;
    if (loopHealthy) post({ type: 'heartbeat' });
  }, HEARTBEAT_MS);

  // ---------------------------------------------------------------- host commands
  addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const cmd = e.data;
    if (cmd === null || typeof cmd !== 'object' || typeof cmd.type !== 'string') return;

    switch (cmd.type) {
      case 'pause':
        hostPaused = true;
        clearKeys();
        syncLoop();
        break;

      case 'resume':
        hostPaused = false;
        syncLoop();
        break;

      case 'stop':
        shutdown();
        break;

      case 'resize': {
        const w = Math.floor(cmd.width);
        const h = Math.floor(cmd.height);
        const valid = (n) => Number.isFinite(n) && n >= 1 && n <= MAX_CANVAS_SIZE;
        if (!valid(w) || !valid(h)) return;
        applyViewport(w, h, true);
        break;
      }

      case 'touch': {
        const { phase, id, x, y } = cmd;
        if (![id, x, y].every(Number.isFinite)) return;
        if (phase === 'start') touchStart(id, x, y);
        else if (phase === 'move') touchMove(id, x, y);
        else if (phase === 'end' || phase === 'cancel') touchEnd(id, x, y, phase === 'cancel');
        break;
      }

      case 'key': {
        const { code, pressed } = cmd;
        if (typeof code === 'string' && typeof pressed === 'boolean') {
          setSourceKey(keySources.keyboard, code, pressed);
        }
        break;
      }

      default:
        break; // unknown commands are ignored
    }
  });
})();