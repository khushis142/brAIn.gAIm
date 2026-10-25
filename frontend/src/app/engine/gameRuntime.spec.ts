import { GAME_BUDGETS, GAME_KEYS, GAME_PROTOCOL_VERSION, GameApi, GameModule, HostCommand, InputState, TouchPhase, TouchPoint } from './gameProtocol';
import { GAME_RUNTIME_SCRIPT } from './gameRuntime';

const RUNTIME_SOURCE = GAME_RUNTIME_SCRIPT;
const CANVAS_WIDTH = 200;
const CANVAS_HEIGHT = 100;

type TouchSnapshot = Pick<TouchPoint, 'id' | 'x' | 'y' | 'justStarted' | 'justEnded' | 'cancelled'>;

/**
 * Runs the runtime script against a fake window so each test gets a fresh runtime
 * and drives frames by hand. Touches are given in canvas pixels (rect is 1:1).
 */
function startRuntime(assets?: Record<string, unknown>) {
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
    __GAME_INPUT__: { protocolVersion: GAME_PROTOCOL_VERSION, username: 'tester', data: { context: 'test' }, assets },
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
  let gameApi: GameApi | null = null;
  const game: GameModule = {
    init: (api) => {
      gameApi = api;
    },
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
  // Missing when the runtime rejected its input and stopped early
  (fakeWindow['registerGame'] as ((game: GameModule) => void) | undefined)?.(game);

  const touch = (type: string, ...points: [id: number, x: number, y: number][]) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      changedTouches: points.map(([identifier, clientX, clientY]) => ({ identifier, clientX, clientY })),
    });
    events.dispatchEvent(event);
  };

  const hostCommand = (data: HostCommand) => {
    const event = new Event('message');
    Object.assign(event, { source: fakeParent, data });
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
    api: () => gameApi,
    touch,
    hostTouch,
    hostCommand,
    /** Runs one animation frame, far enough after the last one to pass the FPS cap. */
    frame: () => {
      const callback = frames.shift();
      if (!callback) throw new Error('No frame scheduled');
      // The runtime restarts its frame clock from performance.now() on resume
      clock = Math.max(clock, performance.now()) + 1000;
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

describe('game runtime script', () => {
  it('can be inlined into a script tag', () => {
    expect(RUNTIME_SOURCE).not.toMatch(/<\/script/i);
  });

  it('offers exactly the shared game keys', () => {
    vi.useFakeTimers();
    const runtime = startRuntime();
    runtime.frame();
    expect(Object.keys(runtime.input()!.keys).sort()).toEqual([...GAME_KEYS].sort());
    vi.clearAllTimers();
    vi.useRealTimers();
    runtime.canvas.remove();
  });
});

describe('game runtime execution budget', () => {
  const BUDGET_SECONDS = GAME_BUDGETS.executionTimeMs / 1000;
  let now = 0;
  let runtime: ReturnType<typeof startRuntime>;
  const errors = () => runtime.posted.filter((m) => m.type === 'error').map((m) => m.message);
  // Each harness frame is one second of play
  const play = (seconds: number) => {
    for (let i = 0; i < seconds; i += 1) runtime.frame();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    runtime = startRuntime();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
    runtime.canvas.remove();
  });

  it('fails a game that plays past the budget', () => {
    play(BUDGET_SECONDS);
    expect(errors()).toEqual([]);
    play(1);
    expect(errors()).toEqual(['Execution time budget exceeded']);
  });

  it('does not count time spent paused', () => {
    play(BUDGET_SECONDS - 10);
    runtime.hostCommand({ type: 'pause' });
    now += 2 * GAME_BUDGETS.executionTimeMs;
    vi.advanceTimersByTime(2 * GAME_BUDGETS.executionTimeMs);
    runtime.hostCommand({ type: 'resume' });
    play(5);
    expect(errors()).toEqual([]);
  });

  it('stops counting once a result is submitted', () => {
    play(10);
    runtime.api()!.submitResult({ score: 1 });
    play(BUDGET_SECONDS);
    expect(errors()).toEqual([]);
  });
});

describe('game runtime assets', () => {
  const MIB = 1024 * 1024;
  const model = (maxBytes?: number) => ({ kind: 'model', url: 'https://cdn.example.com/m.glb', maxBytes });
  let runtime: ReturnType<typeof startRuntime>;
  const errors = () => runtime.posted.filter((m) => m.type === 'error').map((m) => m.message);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
    runtime.canvas.remove();
  });

  it('counts the last manifest entry toward the byte budget', () => {
    vi.useFakeTimers();
    runtime = startRuntime({ a: model(), b: model(), c: model() });
    expect(errors()).toEqual(['Runtime: asset byte budget exceeded']);
  });

  it('accepts a manifest that fills the byte budget exactly', () => {
    vi.useFakeTimers();
    runtime = startRuntime({ a: model(15 * MIB), b: model(15 * MIB), c: model(2 * MIB) });
    expect(errors()).toEqual([]);
  });

  it('registers a font under its manifest id', async () => {
    vi.useFakeTimers();
    const added: string[] = [];
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array(4)));
    vi.stubGlobal('FontFace', class {
      constructor(readonly family: string) {}
      load = async () => this;
    });
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: (font: { family: string }) => added.push(font.family) },
    });
    runtime = startRuntime({ titleFont: { kind: 'font', url: 'https://cdn.example.com/title.woff2' } });
    runtime.frame();
    expect(await runtime.api()!.assets.loadFont('titleFont')).toBe(true);
    expect(added).toEqual(['titleFont']);
    delete (document as { fonts?: unknown }).fonts;
  });
});

describe('game runtime asset progress', () => {
  const model = (maxBytes: number) => ({ kind: 'model', url: 'https://cdn.example.com/m.glb', maxBytes });
  let runtime: ReturnType<typeof startRuntime>;
  const progress = () => {
    const { loaded, total, bytesLoaded, bytesTotal } = runtime.api()!.assets.progress;
    return { loaded, total, bytesLoaded, bytesTotal };
  };

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
    runtime.canvas.remove();
  });

  it('replaces the maxBytes estimate with Content-Length and streams bytesLoaded', async () => {
    let body!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal('fetch', async () => new Response(
      new ReadableStream<Uint8Array>({ start: (controller) => { body = controller; } }),
      { headers: { 'content-length': '300' } },
    ));
    runtime = startRuntime({ scene: model(1000) });
    runtime.frame();
    const load = runtime.api()!.assets.loadModel('scene');
    expect(progress()).toEqual({ loaded: 0, total: 1, bytesLoaded: 0, bytesTotal: 1000 });

    await vi.waitFor(() => expect(progress().bytesTotal).toBe(300));
    body.enqueue(new Uint8Array(100));
    await vi.waitFor(() => expect(progress().bytesLoaded).toBe(100));
    body.enqueue(new Uint8Array(200));
    body.close();
    await load;
    expect(progress()).toEqual({ loaded: 1, total: 1, bytesLoaded: 300, bytesTotal: 300 });
  });

  it('settles on the real size when Content-Length is missing', async () => {
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new Uint8Array(40));
        controller.close();
      },
    })));
    runtime = startRuntime({ scene: model(1000) });
    runtime.frame();
    await runtime.api()!.assets.loadModel('scene');
    expect(progress()).toEqual({ loaded: 1, total: 1, bytesLoaded: 40, bytesTotal: 40 });
  });

  it('drops a failed asset out of the byte counts', async () => {
    vi.stubGlobal('fetch', async (url: string) => url.endsWith('bad.glb')
      ? new Response(null, { status: 404 })
      : new Response(new Uint8Array(50)));
    runtime = startRuntime({
      good: model(1000),
      bad: { ...model(1000), url: 'https://cdn.example.com/bad.glb' },
    });
    runtime.frame();
    await runtime.api()!.assets.preload(['good', 'bad']);
    expect(progress()).toEqual({ loaded: 2, total: 2, bytesLoaded: 50, bytesTotal: 50 });
  });
});
