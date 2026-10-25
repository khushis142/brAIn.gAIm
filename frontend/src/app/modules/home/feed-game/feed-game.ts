import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService, GameItem, LeaderboardEntry, ScoreRead } from '../../../core/api.service';
import { ZombieService } from '../../../core/zombie.service';
import { inlineGameAssets } from '../../../engine/gameAssets';
import { GameEngineService } from '../../../engine/gameEngineService';
import { GameResult } from '../../../engine/gameProtocol';
import { GameSession } from '../../../engine/gameSession';
import { Zombie } from '../../../shared/zombie/zombie';
import { describeError, FeedUser, GameAllowance } from '../feed';

type ScoreSubmissionStatus = 'idle' | 'uploading' | 'saved' | 'failed';

const LAYOUT_TIMEOUT_MS = 1000; // max wait for the game host to get a size
const FALLBACK_GAME_SIZE = { width: 800, height: 600 };

/**
 * Resolves with the element's size once layout gives it one. On mobile the host is
 * often still 0×0 right after an item swap (address bar, keyboard, first render).
 */
function waitForSize(
  element: HTMLElement,
  timeoutMs: number,
): Promise<{ width: number; height: number }> {
  const measure = () => ({ width: element.clientWidth, height: element.clientHeight });
  const initial = measure();
  const Observer = element.ownerDocument.defaultView?.ResizeObserver;
  if ((initial.width > 0 && initial.height > 0) || !Observer) {
    return Promise.resolve(initial.width > 0 && initial.height > 0 ? initial : FALLBACK_GAME_SIZE);
  }
  return new Promise((resolve) => {
    const finish = (size: { width: number; height: number }) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(size);
    };
    const observer = new Observer(() => {
      const size = measure();
      if (size.width > 0 && size.height > 0) finish(size);
    });
    const timer = setTimeout(() => finish(FALLBACK_GAME_SIZE), timeoutMs);
    observer.observe(element);
  });
}

/** One round of a feed game in its own sandboxed session, with the result screen after it */
@Component({
  imports: [RouterLink, Zombie],
  selector: 'app-feed-game',
  styleUrl: './feed-game.css',
  templateUrl: './feed-game.html',
  host: {
    '(window:resize)': 'onResize()',
  },
})
export class FeedGame {
  private readonly api = inject(ApiService);
  private readonly engine = inject(GameEngineService);
  private readonly user = inject(FeedUser);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly zombie = inject(ZombieService);
  private readonly gameHost = viewChild.required<ElementRef<HTMLElement>>('gameHost');

  readonly item = input.required<GameItem>();
  readonly allowance = input<GameAllowance>('paused');
  /** Result of an earlier visit: the round is not played again and its score not resubmitted */
  readonly finishedResult = input<GameResult | null>(null);
  readonly finished = output<GameResult>();

  protected readonly session = signal<GameSession | null>(null);
  private readonly loadError = signal<string | null>(null);
  protected readonly error = computed(() => this.loadError() ?? this.session()?.error() ?? null);
  /** The runtime ended the round after its play-time budget; see gameRuntime.ts */
  protected readonly timedOut = computed(
    () => this.session()?.error() === 'Execution time budget exceeded',
  );
  protected readonly result = computed(() => this.session()?.result() ?? this.finishedResult());
  protected readonly loading = computed(
    () => this.result() === null && this.error() === null && this.session()?.status() !== 'running',
  );
  /**
   * While the round is being played, swipes and arrow keys belong to it. A finished or
   * broken game hands them back to the feed.
   */
  readonly ownsInput = computed(() => this.result() === null && this.error() === null);

  protected readonly scoreSubmissionStatus = signal<ScoreSubmissionStatus>('idle');
  /** Accessories and avatars this round unlocked */
  protected readonly unlockedNames = signal<string[]>([]);
  protected readonly leaderboard = signal<LeaderboardEntry[] | null>(null);
  protected readonly leaderboardStatus = signal<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  protected readonly topLeaderboard = computed(() => this.leaderboard()?.slice(0, 3) ?? []);
  protected readonly playerBest = computed(() => {
    const name = this.username();
    const entries = this.leaderboard();
    if (!name || !entries) return null;
    return entries.find((entry) => entry.username === name) ?? null;
  });

  private readonly username = signal<string | null>(null);
  private intersectionObserver?: IntersectionObserver;
  private visibleRatio = 1;
  private submitted = false;

  constructor() {
    // Runs in the browser after the first render, when #gameHost exists
    afterNextRender(() => {
      this.session.set(this.engine.createSession(this.gameHost().nativeElement));
      this.observeVisibility();
      if (this.finishedResult() === null) {
        void this.load();
      } else {
        void this.user.username().then((name) => this.username.set(name), () => {});
        void this.loadLeaderboard();
      }
    });
    effect(() => {
      const result = this.session()?.result();
      if (!result || this.submitted) return;
      this.submitted = true;
      untracked(() => {
        this.finished.emit(result);
        void this.submitScore(result.score);
      });
    });
    effect(() => {
      this.session();
      this.allowance();
      this.result();
      untracked(() => this.syncLifecycle());
    });
    const onVisibilityChange = () => this.syncLifecycle();
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      this.intersectionObserver?.disconnect();
      this.session()?.destroy();
    });
  }

  /** Loads the round again after a failed download or a crash; it has not been scored yet */
  protected retry(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const item = this.item();
    this.loadError.set(null);
    try {
      const [code, data, username] = await Promise.all([
        loadGameCode(item.url),
        inlineGameAssets(
          item.data ?? { context: `"${item.title}", a short game in a learning feed.` },
          item.assets,
        ),
        this.user.username(),
      ]);
      this.username.set(username);
      const { width, height } = await waitForSize(this.gameHost().nativeElement, LAYOUT_TIMEOUT_MS);
      if (this.destroyRef.destroyed) return;
      this.session()?.start(code, {
        username,
        data,
        width,
        height,
      });
      this.syncLifecycle();
    } catch (err) {
      this.loadError.set(describeError(err));
    }
  }

  private observeVisibility(): void {
    const Observer = document.defaultView?.IntersectionObserver;
    if (!Observer) return;
    this.intersectionObserver = new Observer(
      ([entry]) => {
        this.visibleRatio = entry?.intersectionRatio ?? 0;
        this.syncLifecycle();
      },
      { threshold: [0, 0.5, 1] },
    );
    this.intersectionObserver.observe(this.host.nativeElement);
  }

  private syncLifecycle(): void {
    const game = this.session();
    if (!game) return;
    if (game.result() !== null) {
      game.setLifecycle('completed');
      return;
    }
    if (
      this.allowance() === 'paused' ||
      document.visibilityState === 'hidden' ||
      this.visibleRatio === 0
    ) {
      game.setLifecycle('paused');
      return;
    }
    if (this.visibleRatio < 1) {
      game.setLifecycle('partially visible');
      return;
    }
    if (this.allowance() === 'visible') {
      game.setLifecycle('visible');
      return;
    }
    game.focus();
    game.setLifecycle('playing');
  }

  private async submitScore(score: number): Promise<void> {
    const { id, round_id } = this.item();
    this.scoreSubmissionStatus.set('uploading');
    try {
      const saved = await firstValueFrom(
        this.api.submitScore(id, { score: Math.max(0, score), round_id }),
      );
      this.scoreSubmissionStatus.set('saved');
      await Promise.all([this.loadLeaderboard(), this.showUnlocks(saved)]);
    } catch (error) {
      console.warn('Could not save game score', error);
      this.scoreSubmissionStatus.set('failed');
    }
  }

  private async showUnlocks(saved: ScoreRead): Promise<void> {
    const { newly_unlocked, newly_unlocked_avatars } = saved;
    if (newly_unlocked.length === 0 && newly_unlocked_avatars.length === 0) return;
    try {
      // Refresh so the zombie wears what was just unlocked and names resolve
      await this.zombie.load();
    } catch (error) {
      console.warn('Could not refresh avatar', error);
    }
    if (this.destroyRef.destroyed) return;
    this.unlockedNames.set([
      ...newly_unlocked_avatars.map((id) => `${this.zombie.avatarName(id)} avatar`),
      ...newly_unlocked.map((id) => this.zombie.accessoryName(id)),
    ]);
  }

  private async loadLeaderboard(): Promise<void> {
    this.leaderboardStatus.set('loading');
    try {
      const entries = await firstValueFrom(this.api.getLeaderboard(this.item().id, 100));
      this.leaderboard.set([...entries].sort((left, right) => right.score - left.score));
      this.leaderboardStatus.set('loaded');
    } catch (error) {
      console.warn('Could not load game leaderboard', error);
      this.leaderboardStatus.set('failed');
    }
  }

  protected onResize(): void {
    const host = this.gameHost().nativeElement;
    this.session()?.resize(host.clientWidth, host.clientHeight);
  }
}

async function loadGameCode(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load game (${res.status})`);
  return res.text();
}
