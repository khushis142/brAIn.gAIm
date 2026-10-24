import { GameSession } from './gameSession';

describe('GameSession', () => {
  let container: HTMLElement;
  let session: GameSession;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    session = new GameSession(document, container, '');
    session.start('', { username: 'tester', data: { context: 'test' }, width: 300, height: 200 });
  });

  afterEach(() => {
    session.destroy();
    container.remove();
  });

  it('forwards touches on the iframe element to the game', () => {
    const iframe = container.querySelector('iframe')!;
    const post = vi.spyOn(iframe.contentWindow!, 'postMessage');
    vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20 } as DOMRect);

    const touch = new Event('touchstart', { cancelable: true });
    Object.defineProperty(touch, 'changedTouches', {
      value: [{ identifier: 1, clientX: 60, clientY: 70 }],
    });
    iframe.dispatchEvent(touch);

    expect(post).toHaveBeenCalledWith({ type: 'touch', phase: 'start', id: 1, x: 50, y: 50 }, '*');
    expect(touch.defaultPrevented).toBe(true);
  });
});
