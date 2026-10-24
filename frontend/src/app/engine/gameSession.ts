import { signal } from '@angular/core';
import {
  GameCustomData,
  GameResult,
  GameStartInput,
  GamePerformanceOptions,
  GameAssetManifest,
  GameLifecycleState,
  GameUiDesign,
  HostCommand,
  isSandboxEvent,
  GAME_BUDGETS,
} from './gameProtocol';

export type SessionStatus = 'idle' | 'starting' | 'running' | 'error';

const HEARTBEAT_TIMEOUT_MS = 3000;
const WATCHDOG_INTERVAL_MS = 1000;
const IFRAME_REMOVE_DELAY_MS = 100; // gives the runtime time to call game.destroy()
const MAX_ERROR_LENGTH = 500;
const MAX_GAME_CODE_BYTES = 200 * 1024;
const GAME_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'Space',
  'Enter',
]);

export interface GameSessionOptions<CustomData extends GameCustomData = GameCustomData>
  extends GameStartInput<CustomData> {
  readonly width?: number;
  readonly height?: number;
  readonly performance?: GamePerformanceOptions;
  readonly assets?: GameAssetManifest;
}

/**
 * One running game inside a sandboxed iframe.
 * Create one instance per game view; call destroy() when the view goes away.
 */
export class GameSession {
  private iframe?: HTMLIFrameElement;
  private resizeObserver?: ResizeObserver;
  private lastBeat = 0;
  private watchdog?: ReturnType<typeof setInterval>;
  private resultSubmissions = 0;
  private runtimeReady = false;
  private requestedLifecycle: Exclude<GameLifecycleState, 'disposed'> = 'preloading';

  private readonly _status = signal<SessionStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _result = signal<GameResult | null>(null);
  private readonly _uiDesign = signal<GameUiDesign>({});
  private readonly _lifecycle = signal<GameLifecycleState>('disposed');

  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly result = this._result.asReadonly();
  readonly uiDesign = this._uiDesign.asReadonly();
  readonly lifecycle = this._lifecycle.asReadonly();

  constructor(
    private readonly doc: Document,
    private readonly container: HTMLElement,
    private readonly runtimeSource: string,
  ) {
    doc.defaultView?.addEventListener('message', this.onMessage);
    doc.defaultView?.addEventListener('keydown', this.onHostKeyDown);
    doc.defaultView?.addEventListener('keyup', this.onHostKeyUp);
  }

  // ------------------------------------------------------------ public API

  start<CustomData extends GameCustomData>(
    gameCode: string,
    options: GameSessionOptions<CustomData>,
  ): void {
    this.validateGameCode(gameCode);
    this.stop();
    this._error.set(null);
    this._result.set(null);
    this._uiDesign.set({});
    this.resultSubmissions = 0;
    this.runtimeReady = false;
    this.requestedLifecycle = 'preloading';
    this._lifecycle.set('preloading');
    this._status.set('starting');

    const width = options.width ?? 800;
    const height = options.height ?? 600;
    this.validateCanvasSize(width, height);

    const iframe = this.doc.createElement('iframe');
    // No allow-same-origin: the game gets an opaque origin and cannot touch the host.
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.tabIndex = 0;
    iframe.style.cssText = `width:${width}px;height:${height}px;border:0;display:block`;
    const forwardTouches = (event: TouchEvent): void => {
      event.preventDefault();
      const rect = iframe.getBoundingClientRect();
      const phase = event.type === 'touchstart'
        ? 'start'
        : event.type === 'touchmove'
          ? 'move'
          : event.type === 'touchcancel'
            ? 'cancel'
            : 'end';
      for (const touch of Array.from(event.changedTouches)) {
        iframe.contentWindow?.postMessage({
          type: 'touch',
          phase,
          id: touch.identifier,
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        }, '*');
      }
    };
    iframe.addEventListener('touchstart', forwardTouches, { passive: false });
    iframe.addEventListener('touchmove', forwardTouches, { passive: false });
    iframe.addEventListener('touchend', forwardTouches, { passive: false });
    iframe.addEventListener('touchcancel', forwardTouches, { passive: false });
    iframe.srcdoc = this.buildSrcdoc(gameCode, width, height, options);
    // Key events only reach the iframe once it has focus
    iframe.addEventListener('load', () => {
      this.focus();
    });
    iframe.addEventListener('pointerdown', () => {
      this.focus();
    });

    this.container.appendChild(iframe);
    this.iframe = iframe;
    const ResizeObserverConstructor = this.doc.defaultView?.ResizeObserver;
    if (ResizeObserverConstructor) {
      this.resizeObserver = new ResizeObserverConstructor(() => {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width > 0 && height > 0) this.resize(width, height);
      });
      this.resizeObserver.observe(this.container);
    }

    this.lastBeat = Date.now();
    this.watchdog = setInterval(() => this.checkHeartbeat(), WATCHDOG_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this.watchdog);
    this.watchdog = undefined;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;

    if (this.iframe) {
      this.retire(this.iframe);
      this.iframe = undefined;
    }
    this.runtimeReady = false;
    if (this._status() !== 'error') this._status.set('idle');
  }

  setLifecycle(state: Exclude<GameLifecycleState, 'disposed'>): void {
    if (this._lifecycle() === 'disposed') return;
    this.requestedLifecycle = state;
    this._lifecycle.set(state);
    if (this.runtimeReady) this.applyRequestedLifecycle();
  }

  pause(): void {
    this.send({ type: 'pause' });
  }

  resume(): void {
    this.send({ type: 'resume' });
  }

  focus(): void {
    this.iframe?.focus();
    try {
      this.iframe?.contentWindow?.focus();
    } catch (_) {
      // Best-effort cross-origin focus
    }
  }

  resize(width: number, height: number): void {
    if (!this.iframe || !Number.isFinite(width) || !Number.isFinite(height)) return;
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (width > GAME_BUDGETS.maxCanvasDimension || height > GAME_BUDGETS.maxCanvasDimension ||
        width * height > GAME_BUDGETS.maxCanvasPixels) {
      this.fail('Canvas dimensions exceed the game budget');
      return;
    }
    this.iframe.style.width = `${width}px`;
    this.iframe.style.height = `${height}px`;
    this.send({ type: 'resize', width, height });
  }

  destroy(): void {
    this.stop();
    this.runtimeReady = false;
    this._lifecycle.set('disposed');
    this.doc.defaultView?.removeEventListener('message', this.onMessage);
    this.doc.defaultView?.removeEventListener('keydown', this.onHostKeyDown);
    this.doc.defaultView?.removeEventListener('keyup', this.onHostKeyUp);
  }

  private readonly onHostKeyDown = (event: KeyboardEvent): void => {
    if (this.requestedLifecycle !== 'playing' || this._status() !== 'running') return;
    const target = event.target as HTMLElement | null;
    if (
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable
    ) {
      return;
    }
    if (GAME_KEYS.has(event.code)) {
      event.preventDefault();
      this.send({ type: 'key', code: event.code, pressed: true });
    }
  };

  private readonly onHostKeyUp = (event: KeyboardEvent): void => {
    if (this.requestedLifecycle !== 'playing' || this._status() !== 'running') return;
    const target = event.target as HTMLElement | null;
    if (
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable
    ) {
      return;
    }
    if (GAME_KEYS.has(event.code)) {
      event.preventDefault();
      this.send({ type: 'key', code: event.code, pressed: false });
    }
  };

  // ------------------------------------------------------------ internals

  private validateGameCode(gameCode: string): void {
    if (typeof gameCode !== 'string') {
      throw new Error('Game code must be a string');
    }
    if (new TextEncoder().encode(gameCode).byteLength > MAX_GAME_CODE_BYTES) {
      throw new Error('Game code exceeds the 200 KB limit');
    }
    if (/<\/script/i.test(gameCode)) {
      throw new Error('Game code must not contain a closing script tag');
    }
  }

  private validateCanvasSize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 ||
        width > GAME_BUDGETS.maxCanvasDimension || height > GAME_BUDGETS.maxCanvasDimension ||
        Math.floor(width) * Math.floor(height) > GAME_BUDGETS.maxCanvasPixels) {
      throw new Error('Canvas dimensions exceed the game budget');
    }
  }

  private readonly onMessage = (e: MessageEvent): void => {
    // Only accept messages from our own iframe, and only well-formed ones
    if (!this.iframe || e.source !== this.iframe.contentWindow) return;
    if (
      e.data?.type === 'asset-request' &&
      typeof e.data.path === 'string' &&
      e.data.path.startsWith('/assets/')
    ) {
      void this.sendAsset(e.data.path);
      return;
    }
    if (!isSandboxEvent(e.data)) return;

    switch (e.data.type) {
      case 'started':
        this.runtimeReady = true;
        this._status.set('running');
        this.applyRequestedLifecycle();
        break;
      case 'heartbeat':
        this.lastBeat = Date.now();
        break;
      case 'ui-design':
        this._uiDesign.set(e.data.design);
        break;
      case 'result':
        this.resultSubmissions += 1;
        if (this.resultSubmissions > GAME_BUDGETS.maxResultSubmissions) {
          this.fail('Game exceeded the result submission budget');
          break;
        }
        this._result.set(e.data.result);
        this.setLifecycle('completed');
        break;
      case 'error':
        this.fail(e.data.message.slice(0, MAX_ERROR_LENGTH));
        break;
    }
  };

  private checkHeartbeat(): void {
    // Timers are throttled in background tabs, so a late heartbeat is not a hang
    if (this.doc.hidden) {
      this.lastBeat = Date.now();
      return;
    }
    if (Date.now() - this.lastBeat > HEARTBEAT_TIMEOUT_MS) {
      this.fail('Game is not responding');
    }
  }

  private fail(message: string): void {
    this._error.set(message);
    this._status.set('error');
    this.stop();
  }

  private applyRequestedLifecycle(): void {
    if (this.requestedLifecycle === 'playing') this.resume();
    else this.pause();
  }

  private send(command: HostCommand): void {
    // '*' is required: a sandboxed iframe without allow-same-origin has an opaque origin
    this.iframe?.contentWindow?.postMessage(command, '*');
  }

  private async sendAsset(path: string): Promise<void> {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Asset request failed (${response.status})`);
      const data = await response.arrayBuffer();
      this.iframe?.contentWindow?.postMessage({ type: 'asset-response', path, data }, '*', [data]);
    } catch (error) {
      this.iframe?.contentWindow?.postMessage({
        type: 'asset-error',
        path,
        message: error instanceof Error ? error.message : 'Asset request failed',
      }, '*');
    }
  }

  /** Asks the runtime to shut down (so game.destroy() runs), then removes the iframe. */
  private retire(iframe: HTMLIFrameElement): void {
    iframe.contentWindow?.postMessage({ type: 'stop' } satisfies HostCommand, '*');
    setTimeout(() => iframe.remove(), IFRAME_REMOVE_DELAY_MS);
  }

  private buildSrcdoc<CustomData extends GameCustomData>(
    gameCode: string,
    width: number,
    height: number,
    options: GameSessionOptions<CustomData>,
  ): string {
    const csp = [
      "default-src 'none'",
      "script-src 'unsafe-inline' https://esm.sh",
      "style-src 'unsafe-inline'",
      `img-src data: blob: ${this.assetOrigins(options.assets).join(' ')}`,
      `media-src data: blob: ${this.assetOrigins(options.assets).join(' ')}`,
      `font-src data: blob: ${this.assetOrigins(options.assets).join(' ')}`,
      `connect-src ${this.assetOrigins(options.assets).join(' ') || "'none'"}`,
    ].join('; ');

    // Stop generated code from closing the script tag or opening an HTML comment
    const safeCode = gameCode
      .replace(/<\/script/gi, '<\\/script')
      .replace(/<!--/g, '<\\!--');
    const serializedInput = JSON.stringify({
      protocolVersion: 2,
      username: options.username,
      data: options.data,
      performance: {
        targetFps: options.performance?.targetFps ?? 60,
        adaptiveQuality: options.performance?.adaptiveQuality ?? true,
        maxPixelRatio: options.performance?.maxPixelRatio ?? 2,
        reducedEffects: options.performance?.reducedEffects ?? false,
      },
      assets: options.assets ?? {},
    })
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>html,body{margin:0;background:#000;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}canvas{display:block;touch-action:none}</style>
</head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>window.__GAME_INPUT__ = ${serializedInput};</script>
<script>${this.runtimeSource}</script>
<script>${safeCode}</script>
</body>
</html>`;
  }

  private assetOrigins(assets: GameAssetManifest | undefined): string[] {
    const origins = new Set<string>();
    for (const asset of Object.values(assets ?? {})) {
      try {
        const url = new URL(asset.url);
        if (url.protocol === 'https:') origins.add(url.origin);
      } catch {
        // Invalid entries are ignored here and rejected by the runtime.
      }
    }
    return [...origins];
  }
}
