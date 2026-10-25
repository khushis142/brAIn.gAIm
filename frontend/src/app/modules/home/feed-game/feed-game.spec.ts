import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { ApiService, GameItem } from '../../../core/api.service';
import { GAME_RUNTIME_SOURCE } from '../../../engine/gameRuntimeToken';
import { GameSession } from '../../../engine/gameSession';
import { FeedUser } from '../feed';
import { FeedGame } from './feed-game';

const quiz: GameItem = {
  type: 'game',
  id: 'g',
  title: 'Quiz',
  url: 'quiz.js',
  round_id: 'r',
  data: { context: 'Quiz' },
};

describe('FeedGame', () => {
  let fixture: ComponentFixture<FeedGame>;
  let api: ApiService;
  let fetch: ReturnType<typeof vi.fn>;

  async function create(finishedResult: { score: number } | null = null): Promise<void> {
    fixture = TestBed.createComponent(FeedGame);
    fixture.componentRef.setInput('item', quiz);
    fixture.componentRef.setInput('finishedResult', finishedResult);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fetch = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    await TestBed.configureTestingModule({
      imports: [FeedGame],
      providers: [
        provideRouter([]),
        FeedUser,
        {
          provide: ApiService,
          useValue: {
            getMe: () => of({ username: 'tester' }),
            getLeaderboard: () => of([{ username: 'tester', score: 4 }]),
            submitScore: vi.fn(() => NEVER),
          },
        },
        { provide: GAME_RUNTIME_SOURCE, useValue: '' },
      ],
    }).compileComponents();
    api = TestBed.inject(ApiService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('only plays once the feed has settled on its card', async () => {
    await create();
    const game = fixture.componentInstance as unknown as {
      session: WritableSignal<{
        result(): unknown;
        error(): unknown;
        status(): string;
        focus(): void;
        setLifecycle(state: string): void;
        setSound(muted: boolean, volume: number): void;
        destroy(): void;
      } | null>;
    };
    const setLifecycle = vi.fn();
    game.session.set({
      result: () => null,
      error: () => null,
      status: () => 'running',
      focus: vi.fn(),
      setLifecycle,
      setSound: vi.fn(),
      destroy: vi.fn(),
    });

    for (const allowance of ['paused', 'visible', 'playing']) {
      fixture.componentRef.setInput('allowance', allowance);
      await fixture.whenStable();
    }

    expect(setLifecycle.mock.calls.map(([state]) => state)).toEqual(['paused', 'visible', 'playing']);
  });

  it('shows the earlier result when coming back, without replaying or rescoring', async () => {
    await create({ score: 7 });

    expect(fetch).not.toHaveBeenCalled();
    expect(api.submitScore).not.toHaveBeenCalled();
    expect(fixture.componentInstance.ownsInput()).toBe(false);
    expect(fixture.nativeElement.querySelector('.result-score')?.textContent).toBe('7');
  });

  it('owns input while the round is loading or being played', async () => {
    await create();

    expect(fetch).toHaveBeenCalledWith('quiz.js');
    expect(fixture.componentInstance.ownsInput()).toBe(true);
  });

  it('shows an intro with session stats and starts the round only on Start', async () => {
    fetch.mockResolvedValue(new Response('game code'));
    const start = vi.spyOn(GameSession.prototype, 'start').mockImplementation(() => {});
    await create();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.intro-title')?.textContent).toBe('Quiz');
    expect([...element.querySelectorAll('.intro-stat dd')].map((dd) => dd.textContent)).toEqual([
      '0',
      '0 s',
    ]);
    expect(fixture.componentInstance.ownsInput()).toBe(true);
    expect(start).not.toHaveBeenCalled();

    element.querySelector<HTMLButtonElement>('.intro-start')!.click();
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith('game code', expect.anything()));
    await fixture.whenStable();
    expect(element.querySelector('.intro')).toBeNull();
  });
});
