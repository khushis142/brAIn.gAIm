import type {
  GAME_BUDGETS,
  GameApi,
  GameModule,
  GameRenderer,
  GameResult,
  GameUiDesign,
  HostCommand,
  InputState,
  SandboxEvent,
  WebGlCapabilities,
} from './gameProtocol';
import type { createRuntimeAssets } from './runtime/assets';
import type { createRuntimeKeys } from './runtime/keys';
import type { createRuntimeSound } from './runtime/sound';
import type { createRuntimeTouch } from './runtime/touch';
import type { createRuntimeViewport } from './runtime/viewport';
import type { createRuntimeWebgl } from './runtime/webgl';

/** Shared protocol values handed to the runtime, which cannot import them inside the iframe. */
export interface GameRuntimeConfig {
  readonly protocolVersion: number;
  readonly budgets: typeof GAME_BUDGETS;
  readonly gameKeys: readonly string[];
}

/**
 * The runtime's parts from ./runtime/. Each is serialized into the script next to
 * gameRuntime and handed to it as an argument, since it cannot import them.
 */
export interface GameRuntimeParts {
  readonly createSound: typeof createRuntimeSound;
  readonly createAssets: typeof createRuntimeAssets;
  readonly createViewport: typeof createRuntimeViewport;
  readonly createWebgl: typeof createRuntimeWebgl;
  readonly createKeys: typeof createRuntimeKeys;
  readonly createTouch: typeof createRuntimeTouch;
}

/**
 * The game runtime. Runs INSIDE the sandboxed iframe, before the game's own script.
 * Expects a <canvas id="c"> in the document.
 *
 * Game contract (what the game passes to registerGame): see GameModule and GameApi.
 *   touches lists every finger; gestures also press virtual keys
 *
 * Messages to the host:   SandboxEvent
 * Commands from the host: HostCommand
 *
 * This function owns the loop, the game's lifecycle, api and the host messages. Sound,
 * assets, viewport, WebGL helpers, keys and touch live in ./runtime/ and arrive as `parts`.
 *
 * NOTE: This function and every part are serialized with toString() and injected into
 * the page as one inline script (see GAME_RUNTIME_SCRIPT in gameRuntimeScript.ts). Each
 * must therefore be self-contained: only `import type` and browser globals, never a value
 * from this or another module. Shared values arrive through `config`, the parts through
 * `parts`. The files must also never contain a closing script tag sequence anywhere,
 * not even in comments.
 *
 * NOTE: The runtime shares a realm with the (untrusted) game code, so a
 * malicious game can tamper with it. The security boundary is the iframe
 * sandbox plus the CSP, not this function. The host must still validate every
 * message it receives.
 */
export function gameRuntime(config: GameRuntimeConfig, parts: GameRuntimeParts): void {
  // ---------------------------------------------------------------- config
  const { budgets } = config;
  const MAX_DT = 0.05;               // clamp huge frame gaps (tab switch, lag)
  const HEARTBEAT_MS = 500;          // how often we report "I'm alive"
  const STALL_MS = 2000;             // no frame for this long = loop is dead
  const REGISTER_TIMEOUT_MS = 3000;  // game must call registerGame() by then
  const EXECUTION_TIME_MS = budgets.executionTimeMs;
  const MAX_ERROR_LENGTH = 500;
  const MAX_CANVAS_SIZE = budgets.maxCanvasDimension;
  const MAX_RESULT_BYTES = budgets.maxResultBytes;
  const MAX_UI_TEXT_LENGTH = budgets.maxUiTextLength;
  const MAX_UI_DESIGN_BYTES = budgets.maxUiDesignBytes;
  const MAX_RESULT_SUBMISSIONS = budgets.maxResultSubmissions;
  const MIN_QUALITY_SCALE = 0.5;
  const SLOW_FRAME_LIMIT = 8;
  const REQUIRED_HOOKS = ['init', 'update', 'render'];

  // ---------------------------------------------------------------- helpers
  // '*' is required: a sandboxed iframe without allow-same-origin has an
  // opaque origin, so there is no concrete target origin to name.
  const post = (message: SandboxEvent): void => parent.postMessage(message, '*');

  const describe = (err: unknown): string => {
    const text = err instanceof Error ? (err.message || err.name) : String(err);
    return (text || 'Unknown error').slice(0, MAX_ERROR_LENGTH);
  };

  const canvas = document.getElementById('c') as HTMLCanvasElement | null;
  if (!canvas) {
    post({ type: 'error', message: 'Runtime: canvas #c not found' });
    return;
  }

  // ---------------------------------------------------------------- state
  let game: GameModule | null = null;
  let ctx: CanvasRenderingContext2D | WebGLRenderingContext | null = null;
  let renderer: GameRenderer = '2d';
  let registered = false;
  let failed = false;
  let stopped = false;
  let hostPaused = false;
  let contextLost = false;
  let rafId = 0;
  let last = performance.now();
  let lastFrame = last;
  let registerTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  // Time spent in running frames only; paused, hidden or not-yet-started time is not play time.
  let playTimeMs = 0;
  let resultPosted = false;
  let resultSubmissions = 0;
  let qualityScale = 1;
  let frameTime = 0;
  let averageFrameTime = 0;
  let slowFrameCount = 0;

  // ---------------------------------------------------------------- game input
  const globals = window as unknown as { __GAME_INPUT__?: unknown };
  const gameInput = globals.__GAME_INPUT__ as {
    protocolVersion?: unknown;
    username?: unknown;
    data?: { context?: unknown } | null;
    performance?: Record<string, unknown> | null;
    assets?: unknown;
    muted?: unknown;
    volume?: unknown;
  } | null | undefined;
  delete globals.__GAME_INPUT__;

  if (gameInput === null || typeof gameInput !== 'object' ||
      gameInput.protocolVersion !== config.protocolVersion || typeof gameInput.username !== 'string' ||
      gameInput.data === null || typeof gameInput.data !== 'object' ||
      typeof gameInput.data.context !== 'string' ||
      gameInput.data.context.trim().length === 0) {
    post({ type: 'error', message: 'Runtime: game input must include a context string' });
    return;
  }

  const requestedPerformance = gameInput.performance && typeof gameInput.performance === 'object'
    ? gameInput.performance : {};
  const performanceConfig: Readonly<{
    targetFps: 30 | 60;
    adaptiveQuality: boolean;
    maxPixelRatio: number;
    reducedEffects: boolean;
  }> = Object.freeze({
    targetFps: requestedPerformance['targetFps'] === 30 ? 30 : 60,
    adaptiveQuality: requestedPerformance['adaptiveQuality'] !== false,
    maxPixelRatio: Math.min(Math.max(Number(requestedPerformance['maxPixelRatio']) || 2, 1), 4),
    reducedEffects: requestedPerformance['reducedEffects'] === true,
  });

  // ---------------------------------------------------------------- parts
  const sound = parts.createSound(gameInput.muted === true, gameInput.volume);

  const assetSetup = parts.createAssets(gameInput.assets, budgets);
  if ('error' in assetSetup) {
    post({ type: 'error', message: assetSetup.error });
    return;
  }
  const { assets } = assetSetup;
  // Begin manifest-declared preloads immediately; games can await api.assets.preload().
  assets.preload();

  const viewports = parts.createViewport(canvas, {
    maxCanvasDimension: budgets.maxCanvasDimension,
    maxCanvasPixels: budgets.maxCanvasPixels,
    maxPixelRatio: performanceConfig.maxPixelRatio,
  });

  const webgl = parts.createWebgl();
  let webglCapabilities: WebGlCapabilities = webgl.unavailable;

  const keys = parts.createKeys(canvas, config.gameKeys, () => viewports.current);
  const touchInput = parts.createTouch(keys.toCanvasPoint, () => viewports.current, keys.setTouchKey);
  const input: InputState = { keys: keys.keys, pointer: keys.pointer, touches: touchInput.touches };

  // Without this, a key held while focus is lost would stay "pressed" forever.
  addEventListener('blur', () => {
    keys.clear();
    touchInput.endAll();
    keys.releasePointer();
  });

  function applyViewport(width: number, height: number, notifyGame: boolean): void {
    const next = viewports.apply(width, height, qualityScale);
    if (next && notifyGame && game && typeof game.resize === 'function') {
      try {
        game.resize(next.width, next.height, next);
      } catch (err) {
        fail(err);
      }
    }
  }


  // ---------------------------------------------------------------- api
  // Getters so dimensions and viewport reflect later resizes.
  const api: GameApi = Object.freeze({
    get width() { return viewports.current!.width; },
    get height() { return viewports.current!.height; },
    get viewport() { return viewports.current!; },
    username: typeof gameInput.username === 'string' ? gameInput.username : '',
    data: gameInput.data as GameApi['data'],
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
      createBasicScene: () => renderer === 'webgl' && ctx
        ? webgl.createBasicScene(ctx as WebGLRenderingContext, canvas) : null,
    }),
    submitResult(result: GameResult) {
      if (result === null || typeof result !== 'object' ||
          typeof result.score !== 'number' || !Number.isFinite(result.score)) {
        throw new Error('submitResult() expects an object with a finite score');
      }
      if (++resultSubmissions > MAX_RESULT_SUBMISSIONS) {
        fail(new Error('Result submission budget exceeded'));
        return;
      }
      let resultBytes: number;
      try {
        resultBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
      } catch (_) {
        throw new Error('submitResult() expects JSON-compatible data');
      }
      if (resultBytes > MAX_RESULT_BYTES) {
        fail(new Error('Result exceeds the size budget'));
        return;
      }
      resultPosted = true;
      post({ type: 'result', result });
    },
    setUiDesign(design: GameUiDesign) {
      const validSection = (section: unknown): boolean => {
        if (section === undefined) return true;
        if (section === null || typeof section !== 'object' || Array.isArray(section)) return false;
        const { title, message, resumeLabel, subtitle, scoreLabel } = section as Record<string, unknown>;
        return typeof title === 'string' &&
          (message === undefined || typeof message === 'string') &&
          (resumeLabel === undefined || typeof resumeLabel === 'string') &&
          (subtitle === undefined || typeof subtitle === 'string') &&
          (scoreLabel === undefined || typeof scoreLabel === 'string');
      };
      const validTheme = (theme: unknown): boolean => {
        if (theme === undefined) return true;
        if (theme === null || typeof theme !== 'object' || Array.isArray(theme)) return false;
        const { accent, panel, density } = theme as Record<string, unknown>;
        return (accent === undefined || ['teal', 'amber', 'rose', 'sky'].includes(accent as string)) &&
          (panel === undefined || ['dark', 'light'].includes(panel as string)) &&
          (density === undefined || ['compact', 'comfortable'].includes(density as string));
      };
      if (design === null || typeof design !== 'object' ||
          !validTheme(design.theme) ||
          !validSection(design.pauseMenu) || !validSection(design.leaderboard)) {
        throw new Error('setUiDesign() expects a design object');
      }
      const sections: (Record<string, string | undefined> | undefined)[] = [
        design.pauseMenu as Record<string, string | undefined> | undefined,
        design.leaderboard as Record<string, string | undefined> | undefined,
      ];
      const text = sections.flatMap((section) => section ?
        [section['title'], section['message'], section['resumeLabel'], section['subtitle'], section['scoreLabel']] : []);
      if (text.some((item) => item !== undefined && item.length > MAX_UI_TEXT_LENGTH) ||
          new TextEncoder().encode(JSON.stringify(design)).byteLength > MAX_UI_DESIGN_BYTES) {
        fail(new Error('UI text exceeds the size budget'));
        return;
      }
      post({ type: 'ui-design', design });
    },
  });

  function createContext(selectedRenderer: GameRenderer): CanvasRenderingContext2D | WebGLRenderingContext | null {
    if (selectedRenderer === 'webgl') {
      return canvas!.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' }) ||
        canvas!.getContext('webgl', { antialias: true, powerPreference: 'high-performance' });
    }
    return canvas!.getContext('2d');
  }

  // ---------------------------------------------------------------- loop
  const shouldRun = (): boolean =>
    game !== null && !failed && !stopped && !hostPaused && !contextLost && !document.hidden;

  function frame(now: number): void {
    rafId = 0;
    if (!shouldRun()) return;
    rafId = requestAnimationFrame(frame);

    const targetFrameTime = 1000 / performanceConfig.targetFps;
    if (now - last < targetFrameTime - 1) return;

    const dt = Math.min(Math.max((now - last) / 1000, 0), MAX_DT);
    // syncLoop() resets `last` on every resume, so pauses never add to play time.
    playTimeMs += Math.max(now - last, 0);
    last = now;
    // A submitted result ends gameplay. Do not let the execution budget
    // turn a long-lived result screen into a timeout error.
    if (!resultPosted && playTimeMs > EXECUTION_TIME_MS) {
      fail(new Error('Execution time budget exceeded'));
      return;
    }
    lastFrame = performance.now();
    const startedAt = performance.now();

    try {
      keys.beginFrame();
      game!.update(dt, input);

      keys.endFrame();
      touchInput.advance();

      if (renderer === '2d') {
        const ctx2d = ctx as CanvasRenderingContext2D;
        ctx2d.setTransform(viewports.current!.devicePixelRatio, 0, 0, viewports.current!.devicePixelRatio, 0, 0);
        ctx2d.clearRect(0, 0, viewports.current!.width, viewports.current!.height);
        ctx2d.save();
        try {
          game!.render(ctx2d);
        } finally {
          ctx2d.restore(); // a game cannot leak transforms/styles into the next frame
        }
      } else {
        const gl = ctx as WebGLRenderingContext;
        gl.viewport(0, 0, canvas!.width, canvas!.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        game!.render(gl);
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
          applyViewport(viewports.current!.width, viewports.current!.height, true);
        }
      }
    } catch (err) {
      fail(err);
    }
  }

  // Starts or stops requestAnimationFrame so it matches the current state.
  function syncLoop(): void {
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
    keys.clear();
    touchInput.endAll();
    syncLoop();
  });

  const syncViewport = (): void => {
    const viewport = viewports.current;
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
  function shutdown(): void {
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

  function fail(err: unknown): void {
    if (failed) return; // report only the first error
    failed = true;
    post({ type: 'error', message: describe(err) });
    shutdown();
  }

  function registerGame(candidate: unknown): void {
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
    const hooks = candidate as Record<string, unknown>;
    if (hooks['renderer'] !== undefined && hooks['renderer'] !== '2d' && hooks['renderer'] !== 'webgl') {
      fail(new Error('Game renderer must be "2d" or "webgl"'));
      return;
    }
    const missing = REQUIRED_HOOKS.filter((n) => typeof hooks[n] !== 'function');
    if (missing.length > 0) {
      fail(new Error('Game is missing required function(s): ' + missing.join(', ')));
      return;
    }
    for (const name of ['destroy', 'resize', 'contextLost', 'contextRestored']) {
      if (hooks[name] !== undefined && typeof hooks[name] !== 'function') {
        fail(new Error('Game hook "' + name + '" must be a function'));
        return;
      }
    }

    const module = candidate as GameModule;
    renderer = module.renderer || '2d';
    applyViewport(canvas!.clientWidth || canvas!.width, canvas!.clientHeight || canvas!.height, false);
    ctx = createContext(renderer);
    if (!ctx) {
      fail(new Error('Runtime: ' + renderer + ' context not available'));
      return;
    }
    if (renderer === 'webgl') {
      webglCapabilities = webgl.readCapabilities(ctx as WebGLRenderingContext);
      canvas!.addEventListener('webglcontextlost', onWebGlContextLost);
      canvas!.addEventListener('webglcontextrestored', onWebGlContextRestored);
    }

    game = module;
    try {
      game.init(api);
    } catch (err) {
      fail(err);
      return;
    }

    post({ type: 'started' });
    syncLoop();
  }

  function onWebGlContextLost(event: Event): void {
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

  function onWebGlContextRestored(): void {
    if (failed || stopped || renderer !== 'webgl') return;
    ctx = createContext(renderer);
    if (!ctx) {
      fail(new Error('WebGL context could not be restored'));
      return;
    }
    webglCapabilities = webgl.readCapabilities(ctx as WebGLRenderingContext);
    contextLost = false;
    applyViewport(viewports.current!.width, viewports.current!.height, true);
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
    const data: unknown = e.data;
    if (data === null || typeof data !== 'object' || typeof (data as { type?: unknown }).type !== 'string') return;
    // Only the type is checked so far; every field is validated before use.
    const cmd = data as HostCommand;

    switch (cmd.type) {
      case 'pause':
        hostPaused = true;
        keys.clear();
        touchInput.endAll(); // the host's pause overlay takes over the fingers
        syncLoop();
        break;

      case 'resume':
        hostPaused = false;
        syncLoop();
        break;

      case 'stop':
        shutdown();
        break;

      case 'sound':
        if (typeof cmd.muted === 'boolean') sound.set(cmd.muted, cmd.volume);
        break;

      case 'resize': {
        const w = Math.floor(cmd.width);
        const h = Math.floor(cmd.height);
        const valid = (n: number): boolean => Number.isFinite(n) && n >= 1 && n <= MAX_CANVAS_SIZE;
        if (!valid(w) || !valid(h)) return;
        applyViewport(w, h, true);
        break;
      }

      case 'touch':
        touchInput.forward(cmd.phase, cmd.id, cmd.x, cmd.y);
        break;

      case 'key': {
        const { code, pressed } = cmd;
        if (typeof code === 'string' && typeof pressed === 'boolean') {
          keys.setKeyboardKey(code, pressed);
        }
        break;
      }

      default:
        break; // unknown commands are ignored
    }
  });
}
