import {
  BasicScene,
  BasicSceneBox,
  GAME_BUDGETS,
  GAME_KEYS,
  GAME_PROTOCOL_VERSION,
  GameApi,
  GameAssetKind,
  GameAssetsApi,
  GameModule,
  GameRenderer,
  GameResult,
  GameSafeAreaInsets,
  GameUiDesign,
  GameViewport,
  HostCommand,
  InputState,
  KeyState,
  PointerInput,
  SandboxEvent,
  TouchPhase,
  TouchPoint,
  WebGlCapabilities,
} from './gameProtocol';

/** Shared protocol values handed to the runtime, which cannot import them inside the iframe. */
export interface GameRuntimeConfig {
  readonly protocolVersion: number;
  readonly budgets: typeof GAME_BUDGETS;
  readonly gameKeys: readonly string[];
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface AssetEntry {
  readonly kind: GameAssetKind;
  readonly url: string;
  readonly maxBytes: number;
  readonly preload: boolean;
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
 * NOTE: This function is serialized with toString() and injected into the page as an
 * inline script (see GAME_RUNTIME_SCRIPT). It must therefore be self-contained: only
 * type imports and browser globals, never a value from this or another module. Every
 * shared value arrives through `config`. It must also never contain a closing script
 * tag sequence anywhere, not even in comments.
 *
 * NOTE: The runtime shares a realm with the (untrusted) game code, so a
 * malicious game can tamper with it. The security boundary is the iframe
 * sandbox plus the CSP, not this function. The host must still validate every
 * message it receives.
 */
export function gameRuntime(config: GameRuntimeConfig): void {
  'use strict';

  // ---------------------------------------------------------------- config
  const { budgets } = config;
  const MAX_DT = 0.05;               // clamp huge frame gaps (tab switch, lag)
  const HEARTBEAT_MS = 500;          // how often we report "I'm alive"
  const STALL_MS = 2000;             // no frame for this long = loop is dead
  const REGISTER_TIMEOUT_MS = 3000;  // game must call registerGame() by then
  const EXECUTION_TIME_MS = budgets.executionTimeMs;
  const MAX_ERROR_LENGTH = 500;
  const MAX_CANVAS_SIZE = budgets.maxCanvasDimension;
  const MAX_CANVAS_PIXELS = budgets.maxCanvasPixels;
  const MAX_ASSETS = budgets.maxAssets;
  const MAX_TOTAL_ASSET_BYTES = budgets.maxAssetBytes;
  const MAX_RESULT_BYTES = budgets.maxResultBytes;
  const MAX_UI_TEXT_LENGTH = budgets.maxUiTextLength;
  const MAX_UI_DESIGN_BYTES = budgets.maxUiDesignBytes;
  const MAX_RESULT_SUBMISSIONS = budgets.maxResultSubmissions;
  const MIN_QUALITY_SCALE = 0.5;
  const SLOW_FRAME_LIMIT = 8;
  const REQUIRED_HOOKS = ['init', 'update', 'render'];
  const GAME_KEYS = new Set(config.gameKeys);
  const GAMEPAD_BUTTON_KEYS = new Map([
    [0, 'Space'], [12, 'ArrowUp'], [13, 'ArrowDown'],
    [14, 'ArrowLeft'], [15, 'ArrowRight'],
  ]);
  const GAMEPAD_AXIS_DEADZONE = 0.5;
  const ASSET_LIMITS: Readonly<Record<GameAssetKind, number>> = Object.freeze({
    image: 5 * 1024 * 1024,
    audio: 10 * 1024 * 1024,
    font: 2 * 1024 * 1024,
    model: 15 * 1024 * 1024,
  });

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
  let webglCapabilities: WebGlCapabilities = Object.freeze({
    available: false,
    webgl2: false,
    maxTextureSize: 0,
    maxViewportDimensions: [0, 0] as const,
    antialias: false,
    highPerformance: false,
    renderer: '',
  });

  const pointer: Mutable<PointerInput> = {
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
  let viewport: GameViewport | null = null;
  const keySources: Record<'keyboard' | 'touch' | 'gamepad', Record<string, boolean>> = {
    keyboard: {},
    touch: {},
    gamepad: {},
  };
  const keyStates: Record<string, KeyState> = {};
  for (const code of GAME_KEYS) {
    keyStates[code] = { held: false, justPressed: false, justReleased: false };
  }
  // Every finger on the screen, oldest first; see the multi-touch section below.
  const touches: Mutable<TouchPoint>[] = [];
  const input: InputState = { keys: keyStates, pointer, touches };
  const globals = window as unknown as { __GAME_INPUT__?: unknown };
  const gameInput = globals.__GAME_INPUT__ as {
    protocolVersion?: unknown;
    username?: unknown;
    data?: { context?: unknown } | null;
    performance?: Record<string, unknown> | null;
    assets?: unknown;
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

  const assetManifest = (gameInput.assets && typeof gameInput.assets === 'object' &&
    !Array.isArray(gameInput.assets) ? gameInput.assets : {}) as Record<string, unknown>;
  if (Object.keys(assetManifest).length > MAX_ASSETS) {
    post({ type: 'error', message: 'Runtime: asset count exceeds the budget' });
    return;
  }
  const assetCache = new Map<string, unknown>();
  const assetPending = new Map<string, Promise<unknown>>();
  const assetProgress = { loaded: 0, total: 0, bytesLoaded: 0, bytesTotal: 0 };
  const assetEntries = new Map<string, AssetEntry>();

  for (const [id, entry] of Object.entries(assetManifest)) {
    const totalAssetBytes = [...assetEntries.values()].reduce((total, item) => total + item.maxBytes, 0);
    if (totalAssetBytes > MAX_TOTAL_ASSET_BYTES) {
      post({ type: 'error', message: 'Runtime: asset byte budget exceeded' });
      return;
    }
    const definition = entry as { kind?: unknown; url?: unknown; maxBytes?: unknown; preload?: unknown } | null;
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(id) || definition === null ||
        typeof definition !== 'object' ||
        !['image', 'audio', 'font', 'model'].includes(definition.kind as string) ||
        typeof definition.url !== 'string') continue;
    const kind = definition.kind as GameAssetKind;
    try {
      const url = new URL(definition.url);
      if (url.protocol !== 'https:') continue;
      const hardLimit = ASSET_LIMITS[kind];
      const maxBytes = Math.min(
        hardLimit,
        typeof definition.maxBytes === 'number' && Number.isFinite(definition.maxBytes) &&
          definition.maxBytes > 0
          ? definition.maxBytes : hardLimit,
      );
      assetEntries.set(id, Object.freeze({
        kind,
        url: url.href,
        maxBytes,
        preload: definition.preload === true,
      }));
    } catch (_) {
      // Invalid manifest entries are unavailable and never fetched.
    }
  }

  const addAssetProgress = (id: string): void => {
    if (assetProgress.total === 0 || !assetPending.has(id)) {
      assetProgress.total += 1;
      const definition = assetEntries.get(id);
      assetProgress.bytesTotal += definition?.maxBytes || 0;
    }
  };

  const materializeAsset = async (definition: AssetEntry, bytes: ArrayBuffer): Promise<unknown> => {
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

  const readLimitedBody = async (response: Response, maxBytes: number): Promise<ArrayBuffer> => {
    const reader = response.body?.getReader();
    if (!reader) {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > maxBytes) throw new Error('asset is too large');
      return bytes;
    }
    const chunks: Uint8Array[] = [];
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

  const loadAsset = (id: string, expectedKind: GameAssetKind): Promise<unknown> => {
    if (typeof id !== 'string' || !assetEntries.has(id) || assetEntries.get(id)!.kind !== expectedKind) {
      return Promise.resolve(expectedKind === 'font' ? false : null);
    }
    if (assetCache.has(id)) return Promise.resolve(assetCache.get(id));
    if (assetPending.has(id)) return assetPending.get(id)!;
    const definition = assetEntries.get(id)!;
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

  const assets: GameAssetsApi = Object.freeze({
    progress: Object.freeze({
      get loaded() { return assetProgress.loaded; },
      get total() { return assetProgress.total; },
      get bytesLoaded() { return assetProgress.bytesLoaded; },
      get bytesTotal() { return assetProgress.bytesTotal; },
    }),
    loadImage: (id: string) => loadAsset(id, 'image') as Promise<HTMLImageElement | null>,
    loadAudio: (id: string) => loadAsset(id, 'audio') as Promise<HTMLAudioElement | null>,
    loadFont: (id: string) => loadAsset(id, 'font') as Promise<boolean>,
    loadModel: (id: string) => loadAsset(id, 'model') as Promise<ArrayBuffer | null>,
    preload: async (ids?: readonly string[]) => {
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

  function readSafeArea(): GameSafeAreaInsets {
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

  function createViewport(width: number, height: number): GameViewport {
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

  function applyViewport(width: number, height: number, notifyGame: boolean): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return;
    const next = createViewport(Math.floor(width), Math.floor(height));
    if (viewport && next.width === viewport.width && next.height === viewport.height &&
        next.pixelWidth === viewport.pixelWidth && next.pixelHeight === viewport.pixelHeight &&
        JSON.stringify(next.safeArea) === JSON.stringify(viewport.safeArea)) return;
    viewport = next;
    canvas!.style.width = `${next.width}px`;
    canvas!.style.height = `${next.height}px`;
    canvas!.width = next.pixelWidth;
    canvas!.height = next.pixelHeight;
    if (notifyGame && game && typeof game.resize === 'function') {
      try {
        game.resize(next.width, next.height, next);
      } catch (err) {
        fail(err);
      }
    }
  }

  // Getters so dimensions and viewport reflect later resizes.
  const api: GameApi = Object.freeze({
    get width() { return viewport!.width; },
    get height() { return viewport!.height; },
    get viewport() { return viewport!; },
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
      createBasicScene,
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

  function readWebGlCapabilities(gl: WebGLRenderingContext): WebGlCapabilities {
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
      maxViewportDimensions: [maxViewport[0] || 0, maxViewport[1] || 0] as const,
      antialias: Boolean(gl.getContextAttributes?.()?.antialias),
      highPerformance: /angle|swiftshader|llvmpipe|software/i.test(rendererName) === false,
      renderer: String(rendererName),
    });
  }

  function createBasicScene(): BasicScene | null {
    if (renderer !== 'webgl' || !ctx) return null;
    const gl = ctx as WebGLRenderingContext;
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
    const boxes: { x: number; y: number; z: number; size: number; color: number[]; rotation: number }[] = [];
    const camera = { x: 0, y: 0, z: 5, fov: 60 };
    const multiply = (a: Float32Array, b: Float32Array): Float32Array => {
      const out = new Float32Array(16);
      for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
        out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] +
          a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
      }
      return out;
    };
    const perspective = (aspect: number): Float32Array => {
      const f = 1 / Math.tan(camera.fov * Math.PI / 360);
      const out = new Float32Array(16);
      out[0] = f / aspect; out[5] = f; out[10] = -1; out[11] = -1; out[14] = -0.2;
      return out;
    };
    const render = (timeSeconds = 0): void => {
      gl.useProgram(program);
      gl.enable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 28, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      const projection = perspective(canvas!.width / Math.max(1, canvas!.height));
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
      addBox(box: BasicSceneBox = {}) {
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
  const clearKeys = (): void => {
    for (const source of Object.values(keySources)) {
      for (const code of Object.keys(source)) delete source[code];
    }
  };

  const setSourceKey = (source: Record<string, boolean>, code: string, held: boolean): void => {
    if (!GAME_KEYS.has(code)) return;
    source[code] = held;
  };

  const updateGamepadKeys = (): void => {
    const next: Record<string, boolean> = {};
    for (const gamepad of navigator.getGamepads?.() || []) {
      if (!gamepad || !gamepad.connected) continue;
      for (const [buttonIndex, code] of GAMEPAD_BUTTON_KEYS) {
        if (gamepad.buttons[buttonIndex]?.pressed) next[code] = true;
      }
      if ((gamepad.axes[1] || 0) < -GAMEPAD_AXIS_DEADZONE) next['ArrowUp'] = true;
      if ((gamepad.axes[1] || 0) > GAMEPAD_AXIS_DEADZONE) next['ArrowDown'] = true;
      if ((gamepad.axes[0] || 0) < -GAMEPAD_AXIS_DEADZONE) next['ArrowLeft'] = true;
      if ((gamepad.axes[0] || 0) > GAMEPAD_AXIS_DEADZONE) next['ArrowRight'] = true;
    }
    for (const code of Object.keys(keySources.gamepad)) {
      if (!next[code]) delete keySources.gamepad[code];
    }
    Object.assign(keySources.gamepad, next);
  };

  const updateKeyStates = (): void => {
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

  // Converts client coordinates to logical canvas pixels, or null before layout.
  const toCanvasPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = canvas!.getBoundingClientRect();
    if (!viewport || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(viewport.width, (clientX - rect.left) * viewport.width / rect.width)),
      y: Math.max(0, Math.min(viewport.height, (clientY - rect.top) * viewport.height / rect.height)),
    };
  };

  const updatePointer = (event: PointerEvent): void => {
    const point = toCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const { x, y } = point;
    pointer.deltaX += x - pointer.x;
    pointer.deltaY += y - pointer.y;
    pointer.x = x;
    pointer.y = y;
    pointer.normalizedX = viewport!.width ? x / viewport!.width : 0;
    pointer.normalizedY = viewport!.height ? y / viewport!.height : 0;
  };

  // input.pointer follows the primary pointer only, so a second finger cannot
  // make it jump; games that want every finger read input.touches.
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    try { window.focus(); } catch (_) {}
    if (!event.isPrimary) return;
    updatePointer(event);
    pointer.down = true;
    pointer.justPressed = true;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pointer.down) event.preventDefault();
    if (event.isPrimary) updatePointer(event);
  });
  const releasePointer = (event: PointerEvent): void => {
    event.preventDefault();
    if (!event.isPrimary) return;
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
    endAllTouches();
    if (pointer.down) pointer.justReleased = true;
    pointer.down = false;
  });

  // ---------------------------------------------------------------- multi-touch
  // input.touches holds one entry per finger, oldest first, in logical canvas
  // pixels like input.pointer. A lifted finger stays for one more frame with
  // justEnded, so a tap shorter than a frame is never lost. Entries are updated
  // in place; the array is the same object for the whole game.
  const MAX_TOUCHES = 10;

  const activeTouch = (id: number): Mutable<TouchPoint> | undefined =>
    touches.find((t) => t.id === id && !t.justEnded);

  const moveTouchPoint = (t: Mutable<TouchPoint>, clientX: number, clientY: number): void => {
    const point = toCanvasPoint(clientX, clientY);
    if (!point) return;
    t.deltaX += point.x - t.x;
    t.deltaY += point.y - t.y;
    t.x = point.x;
    t.y = point.y;
    t.normalizedX = viewport!.width ? point.x / viewport!.width : 0;
    t.normalizedY = viewport!.height ? point.y / viewport!.height : 0;
  };

  const trackTouchStart = (id: number, clientX: number, clientY: number): void => {
    if (activeTouch(id) || touches.length >= MAX_TOUCHES) return;
    const point = toCanvasPoint(clientX, clientY);
    if (!point) return;
    touches.push({
      id,
      x: point.x,
      y: point.y,
      normalizedX: viewport!.width ? point.x / viewport!.width : 0,
      normalizedY: viewport!.height ? point.y / viewport!.height : 0,
      startX: point.x,
      startY: point.y,
      deltaX: 0,
      deltaY: 0,
      justStarted: true,
      justEnded: false,
      cancelled: false,
    });
  };

  const trackTouchMove = (id: number, clientX: number, clientY: number): void => {
    const t = activeTouch(id);
    if (t) moveTouchPoint(t, clientX, clientY);
  };

  const trackTouchEnd = (id: number, clientX: number, clientY: number, cancelled: boolean): void => {
    const t = activeTouch(id);
    if (!t) return;
    moveTouchPoint(t, clientX, clientY);
    t.justEnded = true;
    t.cancelled = cancelled;
  };

  // Lost focus or a hidden page means touchend may never arrive.
  function endAllTouches(): void {
    for (const t of touches) {
      if (t.justEnded) continue;
      t.justEnded = true;
      t.cancelled = true;
    }
  }

  // Called after each update(): drop lifted fingers, reset per-frame fields.
  const advanceTouches = (): void => {
    for (let i = touches.length - 1; i >= 0; i -= 1) {
      const t = touches[i];
      if (t.justEnded) {
        touches.splice(i, 1);
      } else {
        t.justStarted = false;
        t.deltaX = 0;
        t.deltaY = 0;
      }
    }
  };

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

  interface GestureTouch {
    readonly id: number;
    readonly startX: number;
    readonly startY: number;
    x: number;
    y: number;
    holdKey: string | null;
    holdTimer: ReturnType<typeof setTimeout> | undefined;
  }

  let touch: GestureTouch | null = null; // the one finger we follow

  const pressBriefly = (code: string): void => {
    setSourceKey(keySources.touch, code, true);
    setTimeout(() => setSourceKey(keySources.touch, code, false), BRIEF_PRESS_MS);
  };

  const sideKey = (x: number): string => (x < innerWidth / 2 ? 'ArrowLeft' : 'ArrowRight');

  const setHoldKey = (code: string | null): void => {
    if (touch!.holdKey === code) return;
    if (touch!.holdKey) setSourceKey(keySources.touch, touch!.holdKey, false);
    touch!.holdKey = code;
    if (code) setSourceKey(keySources.touch, code, true);
  };

  // Touches arrive here directly, or from the host as 'touch' commands (see below)
  // when the browser delivered them to the host page instead. Every finger goes
  // into input.touches; only the first one drives the gesture keys.
  function touchStart(id: number, x: number, y: number): void {
    trackTouchStart(id, x, y);
    if (touch) return;
    const current: GestureTouch = { id, startX: x, startY: y, x, y, holdKey: null, holdTimer: undefined };
    touch = current;
    current.holdTimer = setTimeout(() => {
      // A finger that stayed put is holding; one that moved away is swiping
      const moved = Math.hypot(current.x - current.startX, current.y - current.startY);
      if (touch === current && moved < SWIPE_MIN_PX) setHoldKey(sideKey(current.x));
    }, HOLD_MS);
  }

  function touchMove(id: number, x: number, y: number): void {
    trackTouchMove(id, x, y);
    if (!touch || touch.id !== id) return;
    touch.x = x;
    touch.y = y;
    if (touch.holdKey) setHoldKey(sideKey(x)); // dragging across switches direction
  }

  function touchEnd(id: number, x: number, y: number, cancelled: boolean): void {
    trackTouchEnd(id, x, y, cancelled);
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

  // The host forwards touches the browser delivered to its page instead. Once a
  // touch arrives here directly, this browser delivers them to us, so forwarded
  // ones are ignored: a browser sending both would otherwise count each twice.
  let directTouches = false;

  const preferDirectTouches = (): void => {
    if (directTouches) return;
    directTouches = true;
    // A forwarded finger still down would never see its end; let it go now
    endAllTouches();
    if (touch) {
      clearTimeout(touch.holdTimer);
      setHoldKey(null);
      touch = null;
    }
  };

  addEventListener('touchstart', (e) => {
    e.preventDefault(); // no scrolling, zooming or emulated mouse clicks
    preferDirectTouches();
    for (const t of e.changedTouches) touchStart(t.identifier, t.clientX, t.clientY);
  }, { passive: false });

  addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) touchMove(t.identifier, t.clientX, t.clientY);
  }, { passive: false });

  const onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      touchEnd(t.identifier, t.clientX, t.clientY, e.type === 'touchcancel');
    }
  };
  addEventListener('touchend', onTouchEnd, { passive: false });
  addEventListener('touchcancel', onTouchEnd, { passive: false });

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
      updateKeyStates();
      game!.update(dt, input);

      pointer.justPressed = false;
      pointer.justReleased = false;
      pointer.deltaX = 0;
      pointer.deltaY = 0;
      advanceTouches();

      if (renderer === '2d') {
        const ctx2d = ctx as CanvasRenderingContext2D;
        ctx2d.setTransform(viewport!.devicePixelRatio, 0, 0, viewport!.devicePixelRatio, 0, 0);
        ctx2d.clearRect(0, 0, viewport!.width, viewport!.height);
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
          applyViewport(viewport!.width, viewport!.height, true);
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
    clearKeys();
    endAllTouches();
    syncLoop();
  });

  const syncViewport = (): void => {
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
      webglCapabilities = readWebGlCapabilities(ctx as WebGLRenderingContext);
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
    webglCapabilities = readWebGlCapabilities(ctx as WebGLRenderingContext);
    contextLost = false;
    applyViewport(viewport!.width, viewport!.height, true);
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
        clearKeys();
        endAllTouches(); // the host's pause overlay takes over the fingers
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
        const valid = (n: number): boolean => Number.isFinite(n) && n >= 1 && n <= MAX_CANVAS_SIZE;
        if (!valid(w) || !valid(h)) return;
        applyViewport(w, h, true);
        break;
      }

      case 'touch': {
        const { id, x, y } = cmd;
        const phase: TouchPhase = cmd.phase;
        if (directTouches || ![id, x, y].every(Number.isFinite)) return;
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
}

/**
 * The runtime as inline script source, with the shared protocol values baked in.
 * The host puts it into the game iframe ahead of the game's own script.
 */
export const GAME_RUNTIME_SCRIPT = `(${gameRuntime.toString()})(${JSON.stringify({
  protocolVersion: GAME_PROTOCOL_VERSION,
  budgets: GAME_BUDGETS,
  gameKeys: GAME_KEYS,
} satisfies GameRuntimeConfig)});`;
