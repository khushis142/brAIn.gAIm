import type { GameViewport, KeyState, PointerInput } from '../gameProtocol';
import type { Mutable } from './types';

/** input.keys and input.pointer, fed by the keyboard, gamepads, touch gestures and the host. */
export interface RuntimeKeys {
  readonly keys: Record<string, KeyState>;
  readonly pointer: PointerInput;
  /** Converts client coordinates to logical canvas pixels, or null before layout. */
  toCanvasPoint(clientX: number, clientY: number): { x: number; y: number } | null;
  /** Presses or releases a virtual key for a touch gesture. */
  setTouchKey(code: string, held: boolean): void;
  /** Presses or releases a key the host forwarded from its own page. */
  setKeyboardKey(code: string, held: boolean): void;
  /** Releases every key, e.g. when focus is lost or the host pauses. */
  clear(): void;
  /** Releases the pointer, for a lost focus that will never send pointerup. */
  releasePointer(): void;
  /** Before update(): polls gamepads and works out this frame's key edges. */
  beginFrame(): void;
  /** After update(): resets the pointer's per-frame fields. */
  endFrame(): void;
}

/**
 * Listens to the keyboard on the window and to the pointer on the canvas.
 * input.pointer follows the primary pointer only; every finger is in input.touches.
 *
 * Part of the game runtime: serialized with toString() into the iframe script, so it
 * may use only type imports and browser globals (see gameRuntime.ts).
 */
export function createRuntimeKeys(
  canvas: HTMLCanvasElement,
  gameKeys: readonly string[],
  getViewport: () => GameViewport | null,
): RuntimeKeys {
  const GAME_KEYS = new Set(gameKeys);
  const GAMEPAD_BUTTON_KEYS = new Map([
    [0, 'Space'], [12, 'ArrowUp'], [13, 'ArrowDown'],
    [14, 'ArrowLeft'], [15, 'ArrowRight'],
  ]);
  const GAMEPAD_AXIS_DEADZONE = 0.5;

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
  const keySources: Record<'keyboard' | 'touch' | 'gamepad', Record<string, boolean>> = {
    keyboard: {},
    touch: {},
    gamepad: {},
  };
  const keyStates: Record<string, KeyState> = {};
  for (const code of GAME_KEYS) {
    keyStates[code] = { held: false, justPressed: false, justReleased: false };
  }

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

  const toCanvasPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = canvas.getBoundingClientRect();
    const viewport = getViewport();
    if (!viewport || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(viewport.width, (clientX - rect.left) * viewport.width / rect.width)),
      y: Math.max(0, Math.min(viewport.height, (clientY - rect.top) * viewport.height / rect.height)),
    };
  };

  const updatePointer = (event: PointerEvent): void => {
    const point = toCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const viewport = getViewport()!;
    const { x, y } = point;
    pointer.deltaX += x - pointer.x;
    pointer.deltaY += y - pointer.y;
    pointer.x = x;
    pointer.y = y;
    pointer.normalizedX = viewport.width ? x / viewport.width : 0;
    pointer.normalizedY = viewport.height ? y / viewport.height : 0;
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
  const releasePointerEvent = (event: PointerEvent): void => {
    event.preventDefault();
    if (!event.isPrimary) return;
    updatePointer(event);
    pointer.down = false;
    pointer.justReleased = true;
  };
  canvas.addEventListener('pointerup', releasePointerEvent);
  canvas.addEventListener('pointercancel', releasePointerEvent);

  addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault(); // no page scrolling
    setSourceKey(keySources.keyboard, e.code, true);
  });
  addEventListener('keyup', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    setSourceKey(keySources.keyboard, e.code, false);
  });

  return {
    keys: keyStates,
    pointer,
    toCanvasPoint,
    setTouchKey: (code, held) => setSourceKey(keySources.touch, code, held),
    setKeyboardKey: (code, held) => setSourceKey(keySources.keyboard, code, held),
    clear: clearKeys,
    releasePointer(): void {
      if (pointer.down) pointer.justReleased = true;
      pointer.down = false;
    },
    beginFrame: updateKeyStates,
    endFrame(): void {
      pointer.justPressed = false;
      pointer.justReleased = false;
      pointer.deltaX = 0;
      pointer.deltaY = 0;
    },
  };
}
