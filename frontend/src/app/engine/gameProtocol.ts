/** Contract shared between the host app and the sandboxed runtime. */

export interface GameApi {
  readonly width: number;
  readonly height: number;
}

export interface InputState {
  keys: Record<string, boolean>;
}

/** What a game has to provide (hooks marked with ? are optional). */
export interface GameModule {
  init(api: GameApi): void;
  update(dt: number, input: InputState): void;
  render(ctx: CanvasRenderingContext2D): void;
  resize?(width: number, height: number): void;
  destroy?(): void;
}

/** Messages sent from the sandbox to the host. Treat as untrusted input. */
export type SandboxEvent =
  | { type: 'started' }
  | { type: 'heartbeat' }
  | { type: 'error'; message: string };

/** Commands sent from the host to the sandbox. */
export type HostCommand =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'resize'; width: number; height: number };

export function isSandboxEvent(value: unknown): value is SandboxEvent {
  if (typeof value !== 'object' || value === null) return false;
  const { type, message } = value as { type?: unknown; message?: unknown };
  if (type === 'started' || type === 'heartbeat') return true;
  return type === 'error' && typeof message === 'string';
}