import type { GameViewport, TouchPhase, TouchPoint } from '../gameProtocol';
import type { Mutable } from './types';

/** input.touches plus the gestures that press virtual keys. */
export interface RuntimeTouch {
  /** Every finger on the screen, oldest first; the same array for the whole game. */
  readonly touches: readonly TouchPoint[];
  /** Ends every finger, e.g. when focus is lost and touchend may never arrive. */
  endAll(): void;
  /** After update(): drops lifted fingers and resets per-frame fields. */
  advance(): void;
  /** A touch the host forwarded; ignored once touches arrive directly. */
  forward(phase: TouchPhase, id: number, x: number, y: number): void;
}

/**
 * Listens to touch events on the window. Every finger goes into input.touches; the
 * first one also drives gestures that press the same virtual keys as the keyboard.
 *
 * Part of the game runtime: serialized with toString() into the iframe script, so it
 * may use only type imports and browser globals (see gameRuntime.ts).
 */
export function createRuntimeTouch(
  toCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number } | null,
  getViewport: () => GameViewport | null,
  setTouchKey: (code: string, held: boolean) => void,
): RuntimeTouch {
  // ---------------------------------------------------------------- multi-touch
  // input.touches holds one entry per finger, oldest first, in logical canvas
  // pixels like input.pointer. A lifted finger stays for one more frame with
  // justEnded, so a tap shorter than a frame is never lost. Entries are updated
  // in place; the array is the same object for the whole game.
  const MAX_TOUCHES = 10;
  const touches: Mutable<TouchPoint>[] = [];

  const activeTouch = (id: number): Mutable<TouchPoint> | undefined =>
    touches.find((t) => t.id === id && !t.justEnded);

  const moveTouchPoint = (t: Mutable<TouchPoint>, clientX: number, clientY: number): void => {
    const point = toCanvasPoint(clientX, clientY);
    if (!point) return;
    t.deltaX += point.x - t.x;
    t.deltaY += point.y - t.y;
    t.x = point.x;
    t.y = point.y;
    t.normalizedX = getViewport()!.width ? point.x / getViewport()!.width : 0;
    t.normalizedY = getViewport()!.height ? point.y / getViewport()!.height : 0;
  };

  const trackTouchStart = (id: number, clientX: number, clientY: number): void => {
    if (activeTouch(id) || touches.length >= MAX_TOUCHES) return;
    const point = toCanvasPoint(clientX, clientY);
    if (!point) return;
    touches.push({
      id,
      x: point.x,
      y: point.y,
      normalizedX: getViewport()!.width ? point.x / getViewport()!.width : 0,
      normalizedY: getViewport()!.height ? point.y / getViewport()!.height : 0,
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
    setTouchKey(code, true);
    setTimeout(() => setTouchKey(code, false), BRIEF_PRESS_MS);
  };

  const sideKey = (x: number): string => (x < innerWidth / 2 ? 'ArrowLeft' : 'ArrowRight');

  const setHoldKey = (code: string | null): void => {
    if (touch!.holdKey === code) return;
    if (touch!.holdKey) setTouchKey(touch!.holdKey, false);
    touch!.holdKey = code;
    if (code) setTouchKey(code, true);
  };

  // Touches arrive here directly, or from the host as 'touch' commands (see forward)
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

  return {
    touches,
    endAll: endAllTouches,
    advance: advanceTouches,
    forward(phase: TouchPhase, id: number, x: number, y: number): void {
      if (directTouches || ![id, x, y].every(Number.isFinite)) return;
      if (phase === 'start') touchStart(id, x, y);
      else if (phase === 'move') touchMove(id, x, y);
      else if (phase === 'end' || phase === 'cancel') touchEnd(id, x, y, phase === 'cancel');
    },
  };
}
