// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from './gameSession';

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
    const session = new GameSession(document, container, 'runtime-source');

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

  it('embeds the configured mobile performance profile', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source');

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

  it('updates status, UI design, and result only from the active iframe', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source');
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
    const session = new GameSession(document, container, 'runtime-source');
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    session.pause();
    session.resume();
    session.resize(800, 450);

    expect(iframe.style.width).toBe('800px');
    expect(iframe.style.height).toBe('450px');

    session.destroy();
  });

  it('forwards touches on the iframe element to the game', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const session = new GameSession(document, container, 'runtime-source');
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

  it('rejects oversized or unsafe game code before creating an iframe', () => {
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source');

    expect(() => session.start('</script>', options)).toThrow('closing script tag');
    expect(() => session.start('x'.repeat(200 * 1024 + 1), options)).toThrow('200 KB');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('removes the iframe after stopping and lets the runtime shut down first', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const session = new GameSession(document, container, 'runtime-source');
    session.start(gameCode, options);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    session.stop();

    expect(container.contains(iframe)).toBe(true);
    vi.advanceTimersByTime(100);
    expect(container.contains(iframe)).toBe(false);
    expect(session.status()).toBe('idle');
  });
});
