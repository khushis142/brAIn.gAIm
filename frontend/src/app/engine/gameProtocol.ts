/** Version of the host/game contract. Increase when the contract changes incompatibly. */
export const GAME_PROTOCOL_VERSION = 2;
/** Hard limits enforced by the sandbox runtime and mirrored by the host. */
export const GAME_BUDGETS = Object.freeze({
  executionTimeMs: 5 * 60 * 1000,
  maxAssets: 32,
  maxAssetBytes: 32 * 1024 * 1024,
  maxCanvasDimension: 4096,
  maxCanvasPixels: 16 * 1024 * 1024,
  maxResultBytes: 32 * 1024,
  maxUiTextLength: 200,
  maxUiDesignBytes: 8 * 1024,
  maxResultSubmissions: 3,
});

/** Key codes a game sees in input.keys; the host forwards only these. */
export const GAME_KEYS: readonly string[] = Object.freeze([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

export type GameRenderer = '2d' | 'webgl';

export type GameLifecycleState =
  | 'preloading'
  | 'visible'
  | 'playing'
  | 'partially visible'
  | 'paused'
  | 'completed'
  | 'disposed';

export type GameInputKind = 'touch' | 'keyboard' | 'gamepad';

export interface GamePackageMetadata {
  readonly renderer: GameRenderer;
  readonly orientation: GameOrientation;
  readonly minDurationSeconds: number;
  readonly maxDurationSeconds: number;
  readonly input: readonly GameInputKind[];
  /** Asset IDs used by the package; URLs remain in the approved asset manifest. */
  readonly assets: readonly string[];
}

export interface WebGlCapabilities {
  readonly available: boolean;
  readonly webgl2: boolean;
  readonly maxTextureSize: number;
  readonly maxViewportDimensions: readonly [number, number];
  readonly antialias: boolean;
  readonly highPerformance: boolean;
  readonly renderer: string;
}

export interface BasicSceneBox {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly size?: number;
  readonly color?: readonly [number, number, number, number];
}

export interface BasicScene {
  readonly camera: { x: number; y: number; z: number; fov: number };
  addBox(box?: BasicSceneBox): { x: number; y: number; z: number; size: number; color: number[] };
  render(timeSeconds?: number): void;
  clear(): void;
}

export type GameOrientation = 'portrait' | 'landscape';

export interface GameSafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface GameViewport {
  /** Logical dimensions in CSS pixels used by game rendering. */
  readonly width: number;
  readonly height: number;
  /** Physical canvas backing-store dimensions after device-pixel-ratio scaling. */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly devicePixelRatio: number;
  readonly orientation: GameOrientation;
  readonly safeArea: GameSafeAreaInsets;
}

export interface GamePerformanceOptions {
  readonly targetFps?: 30 | 60;
  readonly adaptiveQuality?: boolean;
  readonly maxPixelRatio?: number;
  readonly reducedEffects?: boolean;
}

export type GameAssetKind = 'image' | 'audio' | 'font' | 'model';

export interface GameAssetDefinition {
  readonly kind: GameAssetKind;
  /** Approved backend/CDN URL. Games only use the manifest id. */
  readonly url: string;
  /** Optional lower limit for this asset; the runtime always applies hard caps. */
  readonly maxBytes?: number;
  readonly preload?: boolean;
}

export type GameAssetManifest = Readonly<Record<string, GameAssetDefinition>>;

/** Contract shared between the host app and the sandboxed runtime. */

export interface GameCustomData {
  readonly context: string;
  readonly [key: string]: unknown;
}

export interface GameStartInput<CustomData extends GameCustomData = GameCustomData> {
  readonly username: string;
  readonly data: CustomData;
}

/** Output published by a game. Additional JSON-compatible fields are allowed. */
export interface GameResult {
  readonly score: number;
  readonly [key: string]: unknown;
}

export interface PauseMenuDesign {
  readonly title: string;
  readonly message?: string;
  readonly resumeLabel?: string;
}

export interface LeaderboardDesign {
  readonly title: string;
  readonly subtitle?: string;
  readonly scoreLabel?: string;
}

export type GameUiAccent = 'teal' | 'amber' | 'rose' | 'sky';
export type GameUiPanel = 'dark' | 'light';
export type GameUiDensity = 'compact' | 'comfortable';

export interface GameUiTheme {
  readonly accent?: GameUiAccent;
  readonly panel?: GameUiPanel;
  readonly density?: GameUiDensity;
}

export interface GameUiDesign {
  readonly theme?: GameUiTheme;
  readonly pauseMenu?: PauseMenuDesign;
  readonly leaderboard?: LeaderboardDesign;
}

export interface GameApi<CustomData extends GameCustomData = GameCustomData> {
  readonly width: number;
  readonly height: number;
  readonly username: string;
  readonly data: CustomData;
  readonly renderer: GameRenderer;
  readonly viewport: GameViewport;
  readonly performance: {
    readonly targetFps: 30 | 60;
    readonly adaptiveQuality: boolean;
    readonly reducedEffects: boolean;
    readonly frameTime: number;
    readonly averageFrameTime: number;
    readonly qualityScale: number;
  };
  readonly assets: GameAssetsApi;
  readonly webgl: {
    readonly capabilities: WebGlCapabilities;
    createBasicScene(): BasicScene | null;
  };
  submitResult(result: GameResult): void;
  setUiDesign(design: GameUiDesign): void;
}

export interface GameAssetsProgress {
  readonly loaded: number;
  readonly total: number;
  readonly bytesLoaded: number;
  /** Real sizes where known, else the asset's maxBytes; equals bytesLoaded once all loads finish. */
  readonly bytesTotal: number;
}

export interface GameAssetsApi {
  readonly progress: GameAssetsProgress;
  loadImage(id: string): Promise<HTMLImageElement | null>;
  loadAudio(id: string): Promise<HTMLAudioElement | null>;
  /** Registers the font under its manifest id as the family name, e.g. ctx.font = '32px "titleFont"'. */
  loadFont(id: string): Promise<boolean>;
  loadModel(id: string): Promise<ArrayBuffer | null>;
  preload(ids?: readonly string[]): Promise<void>;
}

export function isGameUiDesign(value: unknown): value is GameUiDesign {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const design = value as {
    theme?: unknown;
    pauseMenu?: unknown;
    leaderboard?: unknown;
  };
  if (design.theme !== undefined) {
    if (typeof design.theme !== 'object' || design.theme === null || Array.isArray(design.theme)) {
      return false;
    }
    const theme = design.theme as { accent?: unknown; panel?: unknown; density?: unknown };
    if (theme.accent !== undefined && !['teal', 'amber', 'rose', 'sky'].includes(theme.accent as string)) {
      return false;
    }
    if (theme.panel !== undefined && !['dark', 'light'].includes(theme.panel as string)) {
      return false;
    }
    if (theme.density !== undefined && !['compact', 'comfortable'].includes(theme.density as string)) {
      return false;
    }
  }
  let textBytes = 0;
  for (const section of [design.pauseMenu, design.leaderboard]) {
    if (section === undefined) continue;
    if (typeof section !== 'object' || section === null || Array.isArray(section)) return false;
    const { title, message, resumeLabel, subtitle, scoreLabel } = section as {
      title?: unknown;
      message?: unknown;
      resumeLabel?: unknown;
      subtitle?: unknown;
      scoreLabel?: unknown;
    };
    if (typeof title !== 'string') return false;
    const text = [title, message, resumeLabel, subtitle, scoreLabel];
    if (typeof title !== 'string') return false;
    if (text.some((item) => item !== undefined && (typeof item !== 'string' || item.length > GAME_BUDGETS.maxUiTextLength))) {
      return false;
    }
    for (const item of text) {
      if (typeof item === 'string') textBytes += item.length;
    }
  }
  try {
    return textBytes <= GAME_BUDGETS.maxUiDesignBytes &&
      new TextEncoder().encode(JSON.stringify(value)).byteLength <= GAME_BUDGETS.maxUiDesignBytes;
  } catch {
    return false;
  }
}

export interface InputState {
  /** Current key state, merged across keyboard, touch, and gamepad input. */
  keys: Record<string, KeyState>;
  /** The primary pointer only (mouse or first finger). */
  readonly pointer: PointerInput;
  /** Every finger on the screen, oldest first. Same array object every frame. */
  readonly touches: readonly TouchPoint[];
}

export interface TouchPoint {
  /** Stable while the finger is down; may be reused by a later finger. */
  readonly id: number;
  /** Position in logical canvas pixels. */
  readonly x: number;
  readonly y: number;
  /** Position normalized to the range 0..1. */
  readonly normalizedX: number;
  readonly normalizedY: number;
  /** Where the finger first touched, in logical canvas pixels. */
  readonly startX: number;
  readonly startY: number;
  /** Movement since the previous frame. */
  readonly deltaX: number;
  readonly deltaY: number;
  /** True in the first frame the finger appears. */
  readonly justStarted: boolean;
  /** True in the one frame after the finger lifted; the entry is then removed. */
  readonly justEnded: boolean;
  /** With justEnded: the touch was interrupted (pause, focus loss), not lifted. */
  readonly cancelled: boolean;
}

export interface KeyState {
  readonly held: boolean;
  readonly justPressed: boolean;
  readonly justReleased: boolean;
}

export interface PointerInput {
  /** Position in logical canvas pixels. */
  readonly x: number;
  readonly y: number;
  /** Position normalized to the range 0..1. */
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly down: boolean;
  readonly justPressed: boolean;
  readonly justReleased: boolean;
  readonly deltaX: number;
  readonly deltaY: number;
}

/** What a game has to provide (hooks marked with ? are optional). */
export interface GameModule<CustomData extends GameCustomData = GameCustomData> {
  readonly renderer?: GameRenderer;
  init(api: GameApi<CustomData>): void;
  update(dt: number, input: InputState): void;
  render(ctx: CanvasRenderingContext2D | WebGLRenderingContext): void;
  resize?(width: number, height: number, viewport: GameViewport): void;
  contextLost?(): void;
  contextRestored?(api: GameApi<CustomData>): void;
  destroy?(): void;
}

/** Messages sent from the sandbox to the host. Treat as untrusted input. */
export type SandboxEvent =
  | { type: 'started' }
  | { type: 'heartbeat' }
  | { type: 'ui-design'; design: GameUiDesign }
  | { type: 'result'; result: GameResult }
  | { type: 'error'; message: string };

/** Commands sent from the host to the sandbox. */
export type HostCommand =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'resize'; width: number; height: number }
  /** The host's mute button and volume (0..1); covers media elements and Web Audio, see gameRuntime.ts */
  | { type: 'sound'; muted: boolean; volume: number }
  /** A touch the host received on the iframe element; x/y are relative to the iframe. */
  | { type: 'touch'; phase: TouchPhase; id: number; x: number; y: number }
  | { type: 'key'; code: string; pressed: boolean };

export type TouchPhase = 'start' | 'move' | 'end' | 'cancel';

export function isSandboxEvent(value: unknown): value is SandboxEvent {
  if (typeof value !== 'object' || value === null) return false;
  const { type, message, design, result } = value as {
    type?: unknown;
    message?: unknown;
    design?: unknown;
    result?: unknown;
  };
  if (type === 'started' || type === 'heartbeat') return true;
  if (type === 'ui-design') return isGameUiDesign(design);
  if (type === 'result') {
    if (!(
      typeof result === 'object' &&
      result !== null &&
      typeof (result as { score?: unknown }).score === 'number' &&
      Number.isFinite((result as { score: number }).score)
    )) return false;
    try {
      return new TextEncoder().encode(JSON.stringify(result)).byteLength <= GAME_BUDGETS.maxResultBytes;
    } catch {
      return false;
    }
  }
  return type === 'error' && typeof message === 'string';
}