// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from './gameSession';

const CDN_URL = 'https://app.example.test/cdn/';
const gameCode = 'registerGame({init(){},update(){},render(){}});';
const options = {
  username: 'alex',
  data: { context: 'A focus game', difficulty: 'normal' },
  width: 640,
  height: 360,
};

describe('GameSession', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a sandboxed iframe with the game input embedded', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);

    session.start(gameCode, options);

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe?.tabIndex).toBe(0);
    expect(iframe?.style.width).toBe('640px');
    expect(iframe?.style.height).toBe('360px');
    expect(iframe?.srcdoc).toContain('runtime-source');
    expect(iframe?.srcdoc).toContain('"username":"alex"');
    expect(iframe?.srcdoc).toContain('"context":"A focus game"');

    session.destroy();
  });

  it('focuses the iframe when the game loads so it receives keyboard controls', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const focus = vi.spyOn(iframe, 'focus');

    iframe.dispatchEvent(new Event('load'));

    expect(focus).toHaveBeenCalledOnce();
    session.destroy();
  });

  it('embeds the configured mobile performance profile', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);

    session.start(gameCode, {
      ...options,
      performance: {
        targetFps: 30,
        adaptiveQuality: false,
        maxPixelRatio: 1,
        reducedEffects: true,
      },
    });

    const srcdoc = container.querySelector('iframe')?.srcdoc;
    expect(srcdoc).toContain('"targetFps":30');
    expect(srcdoc).toContain('"adaptiveQuality":false');
    expect(srcdoc).toContain('"maxPixelRatio":1');
    expect(srcdoc).toContain('"reducedEffects":true');

    session.destroy();
  });

  it('embeds the approved asset manifest', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);

    session.start(gameCode, {
      ...options,
      assets: {
        player: {
          kind: 'image',
          url: 'https://cdn.example.test/games/player.png',
          maxBytes: 1024 * 1024,
          preload: true,
        },
      },
    });

    const iframe = container.querySelector('iframe');
    expect(iframe?.srcdoc).toContain('"player"');
    expect(iframe?.srcdoc).toContain('https://cdn.example.test/games/player.png');
    expect(iframe?.srcdoc).toContain(
      `connect-src ${CDN_URL} https://cdn.example.test/games/player.png https://esm.sh`,
    );
    expect(iframe?.srcdoc).not.toContain('192.168.');

    session.destroy();
  });

  it('limits asset sources to the exact manifest URLs', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);

    session.start(gameCode, {
      ...options,
      assets: {
        sky: { kind: 'image', url: 'https://assets.example.test/sky.png?v=2' },
        odd: { kind: 'image', url: 'https://assets.example.test/a;b,c.png' },
        plain: { kind: 'image', url: 'http://assets.example.test/plain.png' },
      },
    });

    const srcdoc = container.querySelector('iframe')?.srcdoc ?? '';
    const csp = /Content-Security-Policy" content="([^"]*)"/.exec(srcdoc)?.[1] ?? '';
    const sources = `${CDN_URL} https://assets.example.test/sky.png https://assets.example.test/a%3Bb%2Cc.png`;
    expect(csp).toContain(`img-src data: blob: ${sources};`);
    expect(csp).toContain(`connect-src ${sources} https://esm.sh`);
    expect(csp).not.toContain('http://assets.example.test');

    session.destroy();
  });

  it('does not fetch anything for the game', () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetchSpy);
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);

    for (const path of [`${CDN_URL}games/player.png`, '/assets/../api/v1/me']) {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'asset-request', path } }));
    }
    expect(fetchSpy).not.toHaveBeenCalled();

    session.destroy();
    vi.unstubAllGlobals();
  });

  it('updates status, UI design, and result only from the active iframe', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'started' },
      }),
    );
    expect(session.status()).toBe('running');

    const design = { theme: { accent: 'rose' as const }, pauseMenu: { title: 'Pause' } };
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'ui-design', design },
      }),
    );
    expect(session.uiDesign()).toEqual(design);

    const result = { score: 42, level: 3 };
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'result', result },
      }),
    );
    expect(session.result()).toEqual(result);

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: { type: 'result', result: { score: 999 } },
      }),
    );
    expect(session.result()).toEqual(result);

    session.destroy();
  });

  it('sends pause, resume, and resize commands to the active iframe', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    session.pause();
    session.resume();
    session.resize(800, 450);

    expect(iframe.style.width).toBe('800px');
    expect(iframe.style.height).toBe('450px');

    session.destroy();
  });

  it('tracks lifecycle states and only resumes while playing', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);

    session.setLifecycle('partially visible');
    expect(session.lifecycle()).toBe('partially visible');

    session.setLifecycle('playing');
    expect(session.lifecycle()).toBe('playing');

    session.setLifecycle('completed');
    expect(session.lifecycle()).toBe('completed');

    session.destroy();
    expect(session.lifecycle()).toBe('disposed');
  });

  it('replays the requested lifecycle after the runtime starts', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const send = vi.spyOn(session as never, 'send');

    session.setLifecycle('playing');
    expect(send).not.toHaveBeenCalledWith({ type: 'resume' });

    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data: { type: 'started' },
    }));

    expect(send).toHaveBeenCalledWith({ type: 'resume' });
    session.destroy();
  });

  it('starts a round with the current sound setting and resends it once the runtime starts', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.setSound(true, 0.4);
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const send = vi.spyOn(session as never, 'send');

    expect(iframe.srcdoc).toContain('"muted":true,"volume":0.4');

    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data: { type: 'started' },
    }));

    expect(send).toHaveBeenCalledWith({ type: 'sound', muted: true, volume: 0.4 });
    session.destroy();
  });

  it('forwards touches on the iframe element to the game', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const post = vi.spyOn(iframe.contentWindow!, 'postMessage');
    vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20 } as DOMRect);

    const touch = new Event('touchstart', { cancelable: true });
    Object.defineProperty(touch, 'changedTouches', {
      value: [{ identifier: 1, clientX: 60, clientY: 70 }],
    });
    iframe.dispatchEvent(touch);

    expect(post).toHaveBeenCalledWith({ type: 'touch', phase: 'start', id: 1, x: 50, y: 50 }, '*');
    expect(touch.defaultPrevented).toBe(true);

    session.destroy();
    container.remove();
  });

  it('forwards game keys from host window to iframe while playing', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const post = vi.spyOn(iframe.contentWindow!, 'postMessage');

    window.dispatchEvent(
      new MessageEvent('message', {
        source: iframe.contentWindow,
        data: { type: 'started' },
      }),
    );
    session.setLifecycle('playing');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    expect(post).toHaveBeenCalledWith({ type: 'key', code: 'ArrowLeft', pressed: true }, '*');

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
    expect(post).toHaveBeenCalledWith({ type: 'key', code: 'ArrowLeft', pressed: false }, '*');

    session.destroy();
    container.remove();
  });

  it('rejects oversized or unsafe game code before creating an iframe', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);

    expect(() => session.start('</script>', options)).toThrow('closing script tag');
    expect(() => session.start('x'.repeat(200 * 1024 + 1), options)).toThrow('200 KB');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('rejects canvas dimensions outside the resource budget', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);

    expect(() => session.start(gameCode, { ...options, width: 4097 })).toThrow('Canvas dimensions');
    expect(() => session.start(gameCode, { ...options, width: 4096, height: 4097 })).toThrow('Canvas dimensions');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('stops after too many result submissions', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const result = { type: 'result', result: { score: 1 } };

    for (let submission = 0; submission < 4; submission += 1) {
      window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow, data: result }));
    }

    expect(session.status()).toBe('error');
    expect(session.error()).toContain('result submission budget');
    session.destroy();
  });

  it('tolerates up to three missed heartbeats in a row', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);

    vi.advanceTimersByTime(3000); // three watchdog checks without a heartbeat
    expect(session.status()).toBe('starting');

    vi.advanceTimersByTime(1000); // the fourth one
    expect(session.status()).toBe('error');
    expect(session.error()).toBe('Game is not responding');
    session.destroy();
  });

  it('does not fail when a throttled phone delays the watchdog itself', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);

    // The device stalls for 10 s, then the late check runs once: one miss, not a hang
    vi.setSystemTime(Date.now() + 10_000);
    vi.advanceTimersByTime(1000);

    expect(session.status()).toBe('starting');
    session.destroy();
  });

  it('starts counting missed heartbeats again after one arrives', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;

    vi.advanceTimersByTime(3000);
    window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow, data: { type: 'heartbeat' } }));
    vi.advanceTimersByTime(3000);

    expect(session.status()).toBe('starting');
    session.destroy();
  });

  it('removes the iframe after stopping and lets the runtime shut down first', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source', CDN_URL);
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    session.stop();

    expect(container.contains(iframe)).toBe(true);
    vi.advanceTimersByTime(100);
    expect(container.contains(iframe)).toBe(false);
    expect(session.status()).toBe('idle');
  });
});
