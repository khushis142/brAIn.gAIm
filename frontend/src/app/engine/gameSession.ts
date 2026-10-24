import { signal } from '@angular/core';
import {
  GameResult,
  GameStartInput,
  HostCommand,
  isSandboxEvent,
} from './gameProtocol';

export type SessionStatus = 'idle' | 'starting' | 'running' | 'error';

const HEARTBEAT_TIMEOUT_MS = 3000;
const WATCHDOG_INTERVAL_MS = 1000;
const IFRAME_REMOVE_DELAY_MS = 100; // gives the runtime time to call game.destroy()
const MAX_ERROR_LENGTH = 500;

export interface GameSessionOptions<CustomData = unknown> extends GameStartInput<CustomData> {
  readonly width?: number;
  readonly height?: number;
}

/**
 * One running game inside a sandboxed iframe.
 * Create one instance per game view; call destroy() when the view goes away.
 */
export class GameSession {
  private iframe?: HTMLIFrameElement;
  private lastBeat = 0;
  private watchdog?: ReturnType<typeof setInterval>;

  private readonly _status = signal<SessionStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _result = signal<GameResult | null>(null);

  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly result = this._result.asReadonly();

  constructor(
    private readonly doc: Document,
    private readonly container: HTMLElement,
    private readonly runtimeSource: string,
  ) {
    doc.defaultView?.addEventListener('message', this.onMessage);
  }

  // ------------------------------------------------------------ public API

  start(gameCode: string, width?: number, height?: number): void;
  start<CustomData>(gameCode: string, options: GameSessionOptions<CustomData>): void;
  start<CustomData>(
    gameCode: string,
    optionsOrWidth?: GameSessionOptions<CustomData> | number,
    legacyHeight = 600,
  ): void {
    this.stop();
    this._error.set(null);
    this._result.set(null);
    this._status.set('starting');

    const options: GameSessionOptions<CustomData> =
      typeof optionsOrWidth === 'number'
        ? {
            username: '',
            data: undefined as CustomData,
            width: optionsOrWidth,
            height: legacyHeight,
          }
        : optionsOrWidth ?? {
            username: '',
            data: undefined as CustomData,
          };
    const width = options.width ?? 800;
    const height = options.height ?? 600;

    const iframe = this.doc.createElement('iframe');
    // No allow-same-origin: the game gets an opaque origin and cannot touch the host.
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.cssText = `width:${width}px;height:${height}px;border:0;display:block`;
    iframe.srcdoc = this.buildSrcdoc(gameCode, width, height, options);
    // Key events only reach the iframe once it has focus
    iframe.addEventListener('load', () => iframe.contentWindow?.focus());

    this.container.appendChild(iframe);
    this.iframe = iframe;

    this.lastBeat = Date.now();
    this.watchdog = setInterval(() => this.checkHeartbeat(), WATCHDOG_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this.watchdog);
    this.watchdog = undefined;

    if (this.iframe) {
      this.retire(this.iframe);
      this.iframe = undefined;
    }
    if (this._status() !== 'error') this._status.set('idle');
  }

  pause(): void {
    this.send({ type: 'pause' });
  }

  resume(): void {
    this.send({ type: 'resume' });
  }

  resize(width: number, height: number): void {
    if (!this.iframe) return;
    this.iframe.style.width = `${width}px`;
    this.iframe.style.height = `${height}px`;
    this.send({ type: 'resize', width, height });
  }

  destroy(): void {
    this.stop();
    this.doc.defaultView?.removeEventListener('message', this.onMessage);
  }

  // ------------------------------------------------------------ internals

  private readonly onMessage = (e: MessageEvent): void => {
    // Only accept messages from our own iframe, and only well-formed ones
    if (!this.iframe || e.source !== this.iframe.contentWindow) return;
    if (!isSandboxEvent(e.data)) return;

    switch (e.data.type) {
      case 'started':
        this._status.set('running');
        break;
      case 'heartbeat':
        this.lastBeat = Date.now();
        break;
      case 'result':
        this._result.set(e.data.result);
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

  private send(command: HostCommand): void {
    // '*' is required: a sandboxed iframe without allow-same-origin has an opaque origin
    this.iframe?.contentWindow?.postMessage(command, '*');
  }

  /** Asks the runtime to shut down (so game.destroy() runs), then removes the iframe. */
  private retire(iframe: HTMLIFrameElement): void {
    iframe.contentWindow?.postMessage({ type: 'stop' } satisfies HostCommand, '*');
    setTimeout(() => iframe.remove(), IFRAME_REMOVE_DELAY_MS);
  }

  private buildSrcdoc<CustomData>(
    gameCode: string,
    width: number,
    height: number,
    options: GameSessionOptions<CustomData>,
  ): string {
    const csp = [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      'img-src data: blob:',
      'media-src data: blob:',
    ].join('; ');

    // Stop generated code from closing the script tag or opening an HTML comment
    const safeCode = gameCode
      .replace(/<\/script/gi, '<\\/script')
      .replace(/<!--/g, '<\\!--');
    const serializedInput = JSON.stringify({
      protocolVersion: 1,
      username: options.username,
      data: options.data,
    })
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>html,body{margin:0;background:#000}canvas{display:block}</style>
</head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>window.__GAME_INPUT__ = ${serializedInput};</script>
<script>${this.runtimeSource}</script>
<script>${safeCode}</script>
</body>
</html>`;
  }
}