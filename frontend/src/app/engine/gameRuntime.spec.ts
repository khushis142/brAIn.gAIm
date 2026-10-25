// @ts-ignore -- Node built-in, available in the test runner; @types/node is not installed
import { readFileSync } from 'node:fs';
import { GameModule, InputState, TouchPhase, TouchPoint } from './gameProtocol';

const RUNTIME_SOURCE: string = readFileSync('src/assets/game-runtime.js', 'utf8');
const CANVAS_WIDTH = 200;
const CANVAS_HEIGHT = 100;

type TouchSnapshot = Pick<TouchPoint, 'id' | 'x' | 'y' | 'justStarted' | 'justEnded' | 'cancelled'>;

/**
 * Runs game-runtime.js against a fake window so each test gets a fresh runtime
 * and drives frames by hand. Touches are given in canvas pixels (rect is 1:1).
 */
function startRuntime() {
  const canvas = document.createElement('canvas');
  canvas.id = 'c';
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT }) as DOMRect;
  const noop = () => undefined;
  const fakeContext = new Proxy({}, { get: () => noop });
  canvas.getContext = (() => fakeContext) as unknown as HTMLCanvasElement['getContext'];
  document.body.appendChild(canvas);

  const events = new EventTarget();
  const frames: FrameRequestCallback[] = [];
  const posted: { type: string; message?: string }[] = [];
  const fakeWindow: Record<string, unknown> = {
    __GAME_INPUT__: { protocolVersion: 2, username: 'tester', data: { context: 'test' } },
    devicePixelRatio: 1,
    focus: noop,
  };

  const fakeParent = { postMessage: (message: { type: string }) => posted.push(message) };

  new Function(
    'window', 'addEventListener', 'parent', 'requestAnimationFrame', 'cancelAnimationFrame', 'innerWidth',
    RUNTIME_SOURCE,
  )(
    fakeWindow,
    events.addEventListener.bind(events),
    fakeParent,
    (callback: FrameRequestCallback) => frames.push(callback),
    noop,
    CANVAS_WIDTH,
  );

  // Copies of input.touches as update() saw them, one array per frame
  const seen: TouchSnapshot[][] = [];
  // Movement fields of the first finger, also per frame
  const motion: (Pick<TouchPoint, 'startX' | 'startY' | 'deltaX' | 'deltaY'> | undefined)[] = [];
  let lastInput: InputState | null = null;
  const game: GameModule = {
    init: noop,
    update: (_dt, input) => {
      lastInput = input;
      seen.push(input.touches.map(({ id, x, y, justStarted, justEnded, cancelled }) =>
        ({ id, x, y, justStarted, justEnded, cancelled })));
      const first = input.touches[0];
      motion.push(first && {
        startX: first.startX, startY: first.startY, deltaX: first.deltaX, deltaY: first.deltaY,
      });
    },
    render: noop,
  };
  (fakeWindow['registerGame'] as (game: GameModule) => void)(game);

  const touch = (type: string, ...points: [id: number, x: number, y: number][]) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      changedTouches: points.map(([identifier, clientX, clientY]) => ({ identifier, clientX, clientY })),
    });
    events.dispatchEvent(event);
  };

  /** A touch the host page received and forwarded as a 'touch' command. */
  const hostTouch = (phase: TouchPhase, id: number, x: number, y: number) => {
    const event = new Event('message');
    Object.assign(event, { source: fakeParent, data: { type: 'touch', phase, id, x, y } });
    events.dispatchEvent(event);
  };

  let clock = performance.now();

  return {
    canvas,
    posted,
    seen,
    motion,
    input: () => lastInput,
    touch,
    hostTouch,
    /** Runs one animation frame, far enough after the last one to pass the FPS cap. */
    frame: () => {
      const callback = frames.shift();
      if (!callback) throw new Error('No frame scheduled');
      clock += 1000;
      callback(clock);
    },
    blur: () => events.dispatchEvent(new Event('blur')),
  };
}

describe('game runtime multi-touch', () => {
  let runtime: ReturnType<typeof startRuntime>;

  beforeEach(() => {
    vi.useFakeTimers();
    runtime = startRuntime();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    runtime.canvas.remove();
  });

  it('starts without errors', () => {
    expect(runtime.posted.filter((m) => m.type === 'error')).toEqual([]);
    expect(runtime.posted.some((m) => m.type === 'started')).toBe(true);
  });

  it('tracks two fingers at once', () => {
    runtime.touch('touchstart', [1, 20, 80]);
    runtime.touch('touchstart', [2, 180, 30]);
    runtime.frame();

    expect(runtime.seen.at(-1)).toEqual([
      { id: 1, x: 20, y: 80, justStarted: true, justEnded: false, cancelled: false },
      { id: 2, x: 180, y: 30, justStarted: true, justEnded: false, cancelled: false },
    ]);

    runtime.touch('touchmove', [1, 40, 70]);
    runtime.frame();

    expect(runtime.seen.at(-1)).toEqual([
      { id: 1, x: 40, y: 70, justStarted: false, justEnded: false, cancelled: false },
      { id: 2, x: 180, y: 30, justStarted: false, justEnded: false, cancelled: false },
    ]);
  });

  it('handles several fingers in one touchstart event', () => {
    runtime.touch('touchstart', [1, 10, 10], [2, 190, 90]);
    runtime.frame();

    expect(runtime.seen.at(-1)?.map((t) => t.id)).toEqual([1, 2]);
  });

  it('keeps a lifted finger for exactly one frame with justEnded', () => {
    runtime.touch('touchstart', [1, 20, 80], [2, 180, 30]);
    runtime.frame();
    runtime.touch('touchend', [1, 25, 75]);
    runtime.frame();

    expect(runtime.seen.at(-1)).toEqual([
      { id: 1, x: 25, y: 75, justStarted: false, justEnded: true, cancelled: false },
      { id: 2, x: 180, y: 30, justStarted: false, justEnded: false, cancelled: false },
    ]);

    runtime.frame();
    expect(runtime.seen.at(-1)?.map((t) => t.id)).toEqual([2]);
  });

  it('does not lose a tap that starts and ends between two frames', () => {
    runtime.touch('touchstart', [1, 50, 50]);
    runtime.touch('touchend', [1, 50, 50]);
    runtime.frame();

    expect(runtime.seen.at(-1)).toEqual([
      { id: 1, x: 50, y: 50, justStarted: true, justEnded: true, cancelled: false },
    ]);
  });

  it('cancels all fingers when focus is lost', () => {
    runtime.touch('touchstart', [1, 20, 80], [2, 180, 30]);
    runtime.frame();
    runtime.blur();
    runtime.frame();

    expect(runtime.seen.at(-1)?.every((t) => t.justEnded && t.cancelled)).toBe(true);
    runtime.frame();
    expect(runtime.seen.at(-1)).toEqual([]);
  });

  it('reports per-frame movement and the start position', () => {
    runtime.touch('touchstart', [1, 20, 20]);
    runtime.frame();
    runtime.touch('touchmove', [1, 30, 25]);
    runtime.touch('touchmove', [1, 35, 40]);
    runtime.frame();

    expect(runtime.seen.at(-1)?.[0]).toEqual(expect.objectContaining({ x: 35, y: 40 }));
    expect(runtime.motion.at(-1)).toEqual({ startX: 20, startY: 20, deltaX: 15, deltaY: 20 });
  });

  it('keeps the same touches array between frames', () => {
    runtime.frame();
    const first = runtime.input()!.touches;
    runtime.touch('touchstart', [1, 20, 20]);
    runtime.frame();

    expect(runtime.input()!.touches).toBe(first);
  });

  it('still presses Space for a single-finger tap', () => {
    runtime.touch('touchstart', [1, 50, 50]);
    runtime.touch('touchend', [1, 50, 50]);
    runtime.frame();

    expect(runtime.input()!.keys['Space'].justPressed).toBe(true);
  });
});

describe('game runtime touches forwarded by the host', () => {
  let runtime: ReturnType<typeof startRuntime>;

  beforeEach(() => {
    vi.useFakeTimers();
    runtime = startRuntime();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    runtime.canvas.remove();
  });

  it('uses forwarded touches while none arrive directly', () => {
    runtime.hostTouch('start', 1, 20, 80);
    runtime.hostTouch('end', 1, 20, 80);
    runtime.frame();

    expect(runtime.seen.at(-1)?.map((t) => t.id)).toEqual([1]);
    expect(runtime.input()!.keys['Space'].justPressed).toBe(true);
  });

  it('ignores forwarded touches once one arrived directly', () => {
    runtime.touch('touchstart', [1, 20, 80]);
    // The same finger reported again by the host, under the host's own id
    runtime.hostTouch('start', 7, 20, 80);
    runtime.frame();

    expect(runtime.seen.at(-1)?.map((t) => t.id)).toEqual([1]);

    runtime.touch('touchend', [1, 20, 80]);
    runtime.hostTouch('end', 7, 20, 80);
    runtime.frame();
    runtime.frame();

    expect(runtime.seen.at(-1)).toEqual([]);
  });

  it('releases a forwarded finger that is still down when direct touches start', () => {
    runtime.hostTouch('start', 7, 20, 50);
    vi.advanceTimersByTime(250); // long enough to become a hold on the left half
    runtime.frame();
    expect(runtime.input()!.keys['ArrowLeft'].held).toBe(true);

    runtime.touch('touchstart', [1, 180, 50]);
    runtime.frame();

    expect(runtime.seen.at(-1)).toEqual([
      { id: 7, x: 20, y: 50, justStarted: false, justEnded: true, cancelled: true },
      { id: 1, x: 180, y: 50, justStarted: true, justEnded: false, cancelled: false },
    ]);
    expect(runtime.input()!.keys['ArrowLeft'].held).toBe(false);
  });
});
