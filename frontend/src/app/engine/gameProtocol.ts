/** Version of the host/game contract. Increase when the contract changes incompatibly. */
export const GAME_PROTOCOL_VERSION = 1;

/** Contract shared between the host app and the sandboxed runtime. */

export interface GameStartInput<CustomData = unknown> {
  readonly username: string;
  readonly data: CustomData;
}

/** Output published by a game. Additional JSON-compatible fields are allowed. */
export interface GameResult {
  readonly score: number;
  readonly [key: string]: unknown;
}

export interface GameApi<CustomData = unknown> {
  readonly width: number;
  readonly height: number;
  readonly username: string;
  readonly data: CustomData;
  submitResult(result: GameResult): void;
}

export interface InputState {
  keys: Record<string, boolean>;
}

/** What a game has to provide (hooks marked with ? are optional). */
export interface GameModule<CustomData = unknown> {
  init(api: GameApi<CustomData>): void;
  update(dt: number, input: InputState): void;
  render(ctx: CanvasRenderingContext2D): void;
  resize?(width: number, height: number): void;
  destroy?(): void;
}

/** Messages sent from the sandbox to the host. Treat as untrusted input. */
export type SandboxEvent =
  | { type: 'started' }
  | { type: 'heartbeat' }
  | { type: 'result'; result: GameResult }
  | { type: 'error'; message: string };

/** Commands sent from the host to the sandbox. */
export type HostCommand =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'resize'; width: number; height: number };

export function isSandboxEvent(value: unknown): value is SandboxEvent {
  if (typeof value !== 'object' || value === null) return false;
  const { type, message, result } = value as {
    type?: unknown;
    message?: unknown;
    result?: unknown;
  };
  if (type === 'started' || type === 'heartbeat') return true;
  if (type === 'result') {
    return (
      typeof result === 'object' &&
      result !== null &&
      typeof (result as { score?: unknown }).score === 'number' &&
      Number.isFinite((result as { score: number }).score)
    );
  }
  return type === 'error' && typeof message === 'string';
}