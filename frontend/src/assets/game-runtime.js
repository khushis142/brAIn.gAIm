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
  const MAX_ERROR_LENGTH = 500;
  const MAX_CANVAS_SIZE = 4096;
  const MIN_QUALITY_SCALE = 0.5;
  const SLOW_FRAME_LIMIT = 8;
  const REQUIRED_HOOKS = ['init', 'update', 'render'];
  const GAME_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  ]);

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
  let rafId = 0;
  let last = performance.now();
  let lastFrame = last;
  let registerTimer;
  let heartbeatTimer;
  let performanceConfig = null;
  let qualityScale = 1;
  let frameTime = 0;
  let averageFrameTime = 0;
  let slowFrameCount = 0;

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
  const input = { keys: {}, pointer };
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
    submitResult(result) {
      if (result === null || typeof result !== 'object' ||
          typeof result.score !== 'number' || !Number.isFinite(result.score)) {
        throw new Error('submitResult() expects an object with a finite score');
      }
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
      post({ type: 'ui-design', design });
    },
  });

  function createContext(selectedRenderer) {
    if (selectedRenderer === 'webgl') {
      return canvas.getContext('webgl2') || canvas.getContext('webgl');
    }
    return canvas.getContext('2d');
  }

  // ---------------------------------------------------------------- input
  // Mutate in place so a game holding a reference to input.keys stays valid.
  const clearKeys = () => {
    for (const code of Object.keys(input.keys)) delete input.keys[code];
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
    input.keys[e.code] = true;
  });
  addEventListener('keyup', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    input.keys[e.code] = false;
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
    input.keys[code] = true;
    setTimeout(() => { input.keys[code] = false; }, BRIEF_PRESS_MS);
  };

  const sideKey = (x) => (x < innerWidth / 2 ? 'ArrowLeft' : 'ArrowRight');

  const setHoldKey = (code) => {
    if (touch.holdKey === code) return;
    if (touch.holdKey) input.keys[touch.holdKey] = false;
    touch.holdKey = code;
    if (code) input.keys[code] = true;
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
    game !== null && !failed && !stopped && !hostPaused && !document.hidden;

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
    for (const name of ['destroy', 'resize']) {
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
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        fail(new Error('WebGL context was lost'));
      });
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

      default:
        break; // unknown commands are ignored
    }
  });
})();