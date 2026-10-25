import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NEVER } from 'rxjs';
import { ApiService, FeedItem } from '../../core/api.service';
import { GAME_RUNTIME_SOURCE } from '../../engine/gameRuntimeToken';
import { Home } from './home';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        {
          provide: ApiService,
          useValue: {
            nextItem: () => NEVER,
            getMyZombie: () => NEVER,
            listAccessories: () => NEVER,
            listAvatars: () => NEVER,
          },
        },
        { provide: GAME_RUNTIME_SOURCE, useValue: '' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('ignores swipes while a game is showing', () => {
    const home = component as unknown as {
      item: WritableSignal<FeedItem | null>;
      next(): Promise<void>;
      onTouchStart(event: TouchEvent): void;
      onTouchEnd(event: TouchEvent): void;
    };
    const next = vi.spyOn(home, 'next').mockResolvedValue();
    const swipeUp = () => {
      home.onTouchStart({ touches: [{ clientY: 400 }] } as unknown as TouchEvent);
      home.onTouchEnd({ changedTouches: [{ clientY: 200 }] } as unknown as TouchEvent);
    };

    home.item.set({ type: 'game', id: 'g', title: 'Quiz', url: 'quiz.js', round_id: 'r', data: { context: 'Quiz' } });
    swipeUp();
    expect(next).not.toHaveBeenCalled();

    home.item.set({ type: 'video', id: 'v', title: 'Clip', url: 'clip.mp4' });
    swipeUp();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves ArrowDown to a running game and moves on once it has finished', () => {
    const home = component as unknown as {
      item: WritableSignal<FeedItem | null>;
      session: WritableSignal<{ result(): unknown; error(): unknown; destroy(): void } | null>;
      next(): Promise<void>;
      onKeydown(event: KeyboardEvent): void;
    };
    const next = vi.spyOn(home, 'next').mockResolvedValue();
    const pressArrowDown = () =>
      home.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    let result: unknown = null;
    home.session.set({ result: () => result, error: () => null, destroy: vi.fn() });
    home.item.set({ type: 'game', id: 'g', title: 'Quiz', url: 'quiz.js', round_id: 'r', data: { context: 'Quiz' } });

    pressArrowDown();
    expect(next).not.toHaveBeenCalled();

    result = { score: 3 };
    home.session.set({ result: () => result, error: () => null, destroy: vi.fn() });
    pressArrowDown();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('resumes a game automatically after the feed transition finishes', async () => {
    const home = component as unknown as {
      item: WritableSignal<FeedItem | null>;
      phase: WritableSignal<'idle' | 'leaving' | 'entering'>;
      session: WritableSignal<{
        result(): unknown;
        focus(): void;
        setLifecycle(state: string): void;
        destroy(): void;
      } | null>;
      syncGameLifecycle(): void;
    };
    home.item.set({ type: 'game', id: 'g', title: 'Quiz', url: 'quiz.js', round_id: 'r', data: { context: 'Quiz' } });
    home.phase.set('idle');
    const setLifecycle = vi.fn();
    home.session.set({ result: () => null, focus: vi.fn(), setLifecycle, destroy: vi.fn() });

    home.syncGameLifecycle();

    expect(setLifecycle).toHaveBeenCalledWith('playing');
  });

  it('likes a video on double tap and toggles with the button', () => {
    const home = component as unknown as {
      item: WritableSignal<FeedItem | null>;
      liked(): boolean;
      toggleLike(): void;
      onTapStart(event: PointerEvent): void;
      onTapEnd(event: PointerEvent): void;
    };
    const tap = (timeStamp: number) => {
      const event = { clientX: 50, clientY: 50, offsetX: 50, offsetY: 50, timeStamp } as PointerEvent;
      home.onTapStart(event);
      home.onTapEnd(event);
    };

    home.item.set({ type: 'video', id: 'v', title: 'Clip', url: 'clip.mp4' });
    tap(1000);
    expect(home.liked()).toBe(false);
    tap(1200);
    expect(home.liked()).toBe(true);

    // A second double tap keeps it liked
    tap(2000);
    tap(2100);
    expect(home.liked()).toBe(true);

    home.toggleLike();
    expect(home.liked()).toBe(false);
  });
});
