import { Signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { ApiService, FeedItem } from '../../core/api.service';
import { GAME_RUNTIME_SOURCE } from '../../engine/gameRuntimeToken';
import { FeedEntry } from './feed';
import { Home } from './home';

interface HomeInternals {
  busy: boolean;
  entries: WritableSignal<FeedEntry[]>;
  index: WritableSignal<number>;
  gameOwnsInput: Signal<boolean>;
  next(): Promise<void>;
  previous(): Promise<void>;
  onKeydown(event: KeyboardEvent): void;
  onTouchStart(event: TouchEvent): void;
  onTouchEnd(event: TouchEvent): void;
}

const video = (id: string): FeedItem => ({ type: 'video', id, title: id, url: `${id}.mp4` });

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;
  let home: HomeInternals;
  let api: ApiService;

  beforeEach(async () => {
    // jsdom has no media playback
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
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
    home = component as unknown as HomeInternals;
    api = TestBed.inject(ApiService);
    await fixture.whenStable();
    home.busy = false; // the first load from afterNextRender never resolves here
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Runs a feed move to the end of its leave and enter animations */
  async function settle(move: Promise<void>): Promise<void> {
    await vi.advanceTimersByTimeAsync(1_000);
    await move;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('scrolls back through the history and forward again without refetching', async () => {
    vi.useFakeTimers();
    const nextItem = vi
      .spyOn(api, 'nextItem')
      .mockReturnValueOnce(of(video('a')))
      .mockReturnValueOnce(of(video('b')));
    const currentId = () => home.entries()[home.index()]?.item.id;

    await settle(home.next());
    await settle(home.next());
    expect(currentId()).toBe('b');

    await settle(home.previous());
    expect(currentId()).toBe('a');
    await settle(home.previous()); // nothing before the first item
    expect(currentId()).toBe('a');

    await settle(home.next());
    expect(currentId()).toBe('b');
    expect(nextItem).toHaveBeenCalledTimes(2);
  });

  it('keeps the last 20 items', async () => {
    vi.useFakeTimers();
    let count = 0;
    vi.spyOn(api, 'nextItem').mockImplementation(() => of(video(`item-${count++}`)));

    for (let i = 0; i < 22; i++) await settle(home.next());

    expect(home.entries().length).toBe(20);
    expect(home.entries()[0].item.id).toBe('item-2');
    expect(home.entries()[home.index()].item.id).toBe('item-21');
  });

  it('stays on the current item when the feed cannot be fetched', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'nextItem')
      .mockReturnValueOnce(of(video('a')))
      .mockReturnValueOnce(throwError(() => new Error('offline')));

    await settle(home.next());
    await settle(home.next());

    expect(home.entries().map((entry) => entry.item.id)).toEqual(['a']);
    expect(home.index()).toBe(0);
  });

  it('only moves past a game once it is finished, but lets you go back', async () => {
    vi.useFakeTimers();
    const nextItem = vi
      .spyOn(api, 'nextItem')
      .mockReturnValueOnce(of(video('a')))
      .mockReturnValueOnce(of(video('game')))
      .mockReturnValueOnce(of(video('b')));
    const currentId = () => home.entries()[home.index()]?.item.id;
    await settle(home.next());
    await settle(home.next());

    let gameOwnsInput = true;
    home.gameOwnsInput = (() => gameOwnsInput) as Signal<boolean>;
    await settle(home.next());
    expect(currentId()).toBe('game');
    expect(nextItem).toHaveBeenCalledTimes(2);

    await settle(home.previous());
    expect(currentId()).toBe('a');
    gameOwnsInput = false;
    await settle(home.next());
    gameOwnsInput = true;
    await settle(home.next());
    expect(currentId()).toBe('game');

    gameOwnsInput = false; // finished
    await settle(home.next());
    expect(currentId()).toBe('b');
  });

  it('leaves swipes and arrow keys to a game being played', () => {
    let gameOwnsInput = true;
    home.gameOwnsInput = (() => gameOwnsInput) as Signal<boolean>;
    const next = vi.spyOn(home, 'next').mockResolvedValue();
    const previous = vi.spyOn(home, 'previous').mockResolvedValue();
    const swipe = (fromY: number, toY: number) => {
      home.onTouchStart({ touches: [{ clientY: fromY }] } as unknown as TouchEvent);
      home.onTouchEnd({ changedTouches: [{ clientY: toY }] } as unknown as TouchEvent);
    };
    const press = (key: string) =>
      home.onKeydown(new KeyboardEvent('keydown', { key, cancelable: true }));

    swipe(400, 200);
    swipe(200, 400);
    press('ArrowDown');
    press('ArrowUp');
    expect(next).not.toHaveBeenCalled();
    expect(previous).not.toHaveBeenCalled();

    gameOwnsInput = false;
    swipe(400, 200);
    press('ArrowDown');
    expect(next).toHaveBeenCalledTimes(2);
    swipe(200, 400);
    press('ArrowUp');
    expect(previous).toHaveBeenCalledTimes(2);
  });
});
