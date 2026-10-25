import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LucideBrain, LucideChevronDown } from '@lucide/angular';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService, FeedItem, LeaderboardEntry, ScoreRead } from '../../core/api.service';
import { ZombieService } from '../../core/zombie.service';
import { GameEngineService } from '../../engine/gameEngineService';
import { GameSession } from '../../engine/gameSession';
import { Zombie } from '../../shared/zombie/zombie';

type Phase = 'idle' | 'leaving' | 'entering';
type PlaybackBubble = 'play' | 'pause';
type ScoreSubmissionStatus = 'idle' | 'uploading' | 'saved' | 'failed';

const LEAVE_MS = 450; // keep in sync with the animations in home.css
const ENTER_MS = 450;
const SWIPE_MIN_PX = 60;
const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 10; // more movement than this is a swipe, not a tap
const BURST_MS = 800; // keep in sync with the burst animation in home.css
const LAYOUT_TIMEOUT_MS = 1000; // max wait for the game host to get a size
const FALLBACK_GAME_SIZE = { width: 800, height: 600 };

interface Burst {
  id: number;
  x: number;
  y: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolves with the element's size once layout gives it one. On mobile the host is
 * often still 0×0 right after an item swap (address bar, keyboard, first render).
 */
function waitForSize(element: HTMLElement, timeoutMs: number): Promise<{ width: number; height: number }> {
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

@Component({
  imports: [LucideBrain, LucideChevronDown, RouterLink, Zombie],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
  host: {
    '(window:keydown)': 'onKeydown($event)',
    '(window:resize)': 'onResize()',
  },
})
export class Home {
  private readonly api = inject(ApiService);
  private readonly engine = inject(GameEngineService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly zombie = inject(ZombieService);
  private readonly gameHost = viewChild.required<ElementRef<HTMLElement>>('gameHost');
  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  protected readonly item = signal<FeedItem | null>(null);
  protected readonly phase = signal<Phase>('idle');
  protected readonly session = signal<GameSession | null>(null);
  protected readonly currentTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly isPlaying = signal(true);
  protected readonly isSeeking = signal(false);
  protected readonly arePlayerControlsVisible = signal(false);
  protected readonly playbackBubble = signal<PlaybackBubble | null>(null);
  protected readonly scoreSubmissionStatus = signal<ScoreSubmissionStatus>('idle');
  /** Accessories and avatars unlocked by the game on screen */
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
  protected readonly playheadPercent = computed(() => {
    const duration = this.duration();
    return duration > 0 ? (this.currentTime() / duration) * 100 : 0;
  });
  protected readonly seekTimestamp = computed(() => formatTime(this.currentTime()));
  private readonly loadError = signal<string | null>(null);
  protected readonly error = computed(
    () =>
      this.loadError() ?? (this.item()?.type === 'game' ? this.session()?.error() : null) ?? null,
  );

  // Likes are cosmetic for now: kept in memory until the backend has an endpoint
  private readonly likedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly liked = computed(() => {
    const current = this.item();
    return current !== null && this.likedIds().has(current.id);
  });
  protected readonly bursts = signal<Burst[]>([]);

  private busy = false;
  private readonly username = signal<string | null>(null);
  private touchStartY: number | null = null;
  private seekTimestampTimer: ReturnType<typeof setTimeout> | null = null;
  private playbackBubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private playerControlsTimer: ReturnType<typeof setTimeout> | null = null;
  private tapStart: { x: number; y: number } | null = null;
  private lastTapAt = -Infinity;
  private nextBurstId = 0;
  private singleTapTimer: ReturnType<typeof setTimeout> | null = null;
  private intersectionObserver?: IntersectionObserver;
  private visibleRatio = 1;
  private submittedRoundId: string | null = null;

  constructor() {
    // Runs in the browser after the first render, when #gameHost exists
    afterNextRender(() => {
      this.session.set(this.engine.createSession(this.gameHost().nativeElement));
      this.observeCardLifecycle();
      this.next();
      // The mascot is decoration; without it the result screen still works
      this.zombie.load().catch(() => {});
    });
    effect(() => {
      const result = this.session()?.result();
      const current = this.item();
        if (result === null || result === undefined || current?.type !== 'game' ||
          this.submittedRoundId === current.round_id) return;
      this.submittedRoundId = current.round_id;
      void this.submitScore(current.id, current.round_id, result.score);
    });
    const onVisibilityChange = () => this.syncGameLifecycle();
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      this.intersectionObserver?.disconnect();
      this.session()?.destroy();
      this.clearTimers();
    });
  }

  private observeCardLifecycle(): void {
    const Observer = document.defaultView?.IntersectionObserver;
    if (!Observer) return;
    this.intersectionObserver = new Observer(
      ([entry]) => {
        this.visibleRatio = entry?.intersectionRatio ?? 0;
        this.syncGameLifecycle();
      },
      { threshold: [0, 0.5, 1] },
    );
    this.intersectionObserver.observe(this.card().nativeElement);
  }

  private syncGameLifecycle(): void {
    const current = this.item();
    const game = this.session();
    if (!game || current?.type !== 'game') return;
    if (game.result() !== null) {
      game.setLifecycle('completed');
      return;
    }
    if (document.visibilityState === 'hidden' || this.visibleRatio === 0) {
      game.setLifecycle('paused');
      return;
    }
    if (this.visibleRatio < 1) {
      game.setLifecycle('partially visible');
      return;
    }
    if (this.phase() !== 'idle') {
      game.setLifecycle('visible');
      return;
    }
    game.focus();
    game.setLifecycle('playing');
  }

  private clearTimers(): void {
    if (this.seekTimestampTimer !== null) clearTimeout(this.seekTimestampTimer);
    if (this.playbackBubbleTimer !== null) clearTimeout(this.playbackBubbleTimer);
    if (this.playerControlsTimer !== null) clearTimeout(this.playerControlsTimer);
    if (this.singleTapTimer !== null) clearTimeout(this.singleTapTimer);
    this.seekTimestampTimer = null;
    this.playbackBubbleTimer = null;
    this.playerControlsTimer = null;
    this.singleTapTimer = null;
  }

  protected async next(): Promise<void> {
    if (this.busy) return; // ignore input while a transition is running
    this.session()?.setLifecycle('paused');
    this.busy = true;
    this.loadError.set(null);

    const hasItem = this.item() !== null;
    if (hasItem) this.phase.set('leaving');

    try {
      // Fetch the next item while the leave animation plays
      const [nextItem] = await Promise.all([
        firstValueFrom(this.api.nextItem()),
        wait(hasItem ? LEAVE_MS : 0),
      ]);
      await this.show(nextItem);
      this.phase.set('entering');
      await wait(ENTER_MS);
    } catch (err) {
      this.loadError.set(describeError(err));
    } finally {
      this.phase.set('idle');
      this.syncGameLifecycle();
      this.busy = false;
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault(); // stop the page from scrolling
    this.next();
  }

  protected onTouchStart(event: TouchEvent): void {
    // Swipes during a game belong to the game; once it has finished they move on again
    const gameRunning = this.item()?.type === 'game' && this.session()?.result() == null;
    this.touchStartY = gameRunning ? null : event.touches[0].clientY;
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (this.touchStartY === null) return;
    const swipedUp = this.touchStartY - event.changedTouches[0].clientY;
    this.touchStartY = null;
    if (swipedUp > SWIPE_MIN_PX) this.next();
  }

  protected toggleLike(): void {
    const current = this.item();
    if (current === null) return;
    this.setLiked(current.id, !this.liked());
  }

  protected onTapStart(event: PointerEvent): void {
    this.tapStart = { x: event.clientX, y: event.clientY };
  }

  protected onTapEnd(event: PointerEvent): void {
    const start = this.tapStart;
    this.tapStart = null;
    const current = this.item();
    if (start === null || current === null) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return;

    if (event.timeStamp - this.lastTapAt > DOUBLE_TAP_MS) {
      this.lastTapAt = event.timeStamp;
      this.singleTapTimer = setTimeout(() => {
        this.singleTapTimer = null;
        this.togglePlayback();
      }, DOUBLE_TAP_MS);
      return;
    }
    if (this.singleTapTimer !== null) clearTimeout(this.singleTapTimer);
    this.singleTapTimer = null;
    // Double tap only likes, never unlikes; the button does that.
    this.lastTapAt = -Infinity;
    this.setLiked(current.id, true);
    const burst = { id: this.nextBurstId++, x: event.offsetX, y: event.offsetY };
    this.bursts.update((all) => [...all, burst]);
    setTimeout(() => this.bursts.update((all) => all.filter((b) => b !== burst)), BURST_MS);
  }

  private setLiked(id: string, liked: boolean): void {
    this.likedIds.update((ids) => {
      const next = new Set(ids);
      if (liked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private async submitScore(gameId: string, roundId: string, score: number): Promise<void> {
    this.scoreSubmissionStatus.set('uploading');
    try {
      const saved = await firstValueFrom(this.api.submitScore(gameId, {
        score: Math.max(0, score),
        round_id: roundId,
      }));
      this.scoreSubmissionStatus.set('saved');
      await Promise.all([this.loadLeaderboard(gameId), this.showUnlocks(roundId, saved)]);
    } catch (error) {
      console.warn('Could not save game score', error);
      this.scoreSubmissionStatus.set('failed');
    }
  }

  private async showUnlocks(roundId: string, saved: ScoreRead): Promise<void> {
    const { newly_unlocked, newly_unlocked_avatars } = saved;
    if (newly_unlocked.length === 0 && newly_unlocked_avatars.length === 0) return;
    try {
      // Refresh so the zombie wears what was just unlocked and names resolve
      await this.zombie.load();
    } catch (error) {
      console.warn('Could not refresh avatar', error);
    }
    const current = this.item();
    if (current?.type !== 'game' || current.round_id !== roundId) return;
    this.unlockedNames.set([
      ...newly_unlocked_avatars.map((id) => `${this.zombie.avatarName(id)} avatar`),
      ...newly_unlocked.map((id) => this.zombie.accessoryName(id)),
    ]);
  }

  private async loadLeaderboard(gameId: string): Promise<void> {
    this.leaderboardStatus.set('loading');
    try {
      const entries = await firstValueFrom(this.api.getLeaderboard(gameId, 100));
      this.leaderboard.set([...entries].sort((left, right) => right.score - left.score));
      this.leaderboardStatus.set('loaded');
    } catch (error) {
      console.warn('Could not load game leaderboard', error);
      this.leaderboardStatus.set('failed');
    }
  }

  protected onResize(): void {
    if (this.item()?.type !== 'game') return;
    const host = this.gameHost().nativeElement;
    this.session()?.resize(host.clientWidth, host.clientHeight);
  }

  protected onVideoLoadedMetadata(event: Event): void {
    const video = event.target as HTMLVideoElement;
    this.duration.set(Number.isFinite(video.duration) ? video.duration : 0);
    this.currentTime.set(video.currentTime);
  }

  protected onVideoTimeUpdate(event: Event): void {
    this.currentTime.set((event.target as HTMLVideoElement).currentTime);
  }

  protected onVideoPlay(): void {
    this.isPlaying.set(true);
  }

  protected onVideoPause(): void {
    this.isPlaying.set(false);
  }

  protected togglePlayback(): void {
    const video = this.video()?.nativeElement;
    if (!video) return;

    this.showPlayerControls();
    if (video.paused) {
      void video.play();
      this.showPlaybackBubble('play');
    } else {
      video.pause();
      this.showPlaybackBubble('pause');
    }
  }

  protected onSeekStart(event: Event): void {
    event.stopPropagation();
    this.seekToRangeValue(event);
    this.showPlayerControls();
    this.showSeekTimestamp();
  }

  protected onSeekInput(event: Event): void {
    event.stopPropagation();
    this.seekToRangeValue(event);
    this.showPlayerControls();
    this.showSeekTimestamp();
  }

  private seekToRangeValue(event: Event): void {
    const nextTime = (event.target as HTMLInputElement).valueAsNumber;
    const video = this.video()?.nativeElement;
    if (!video || !Number.isFinite(nextTime)) return;

    video.currentTime = nextTime;
    this.currentTime.set(nextTime);
  }

  protected onSeekEnd(event: Event): void {
    event.stopPropagation();
    this.hideSeekTimestampSoon();
  }

  private async show(item: FeedItem): Promise<void> {
    // Download game code before swapping, so a failed download keeps the current item
    const gameItem = item.type === 'game' ? item : null;
    const gameCode = gameItem === null ? null : await loadGameCode(gameItem.url);
    if (gameItem !== null && this.username() === null) {
      this.username.set((await firstValueFrom(this.api.getMe())).username);
    }

    this.session()?.stop();
    this.clearTimers();
    this.currentTime.set(0);
    this.duration.set(0);
    this.isPlaying.set(true);
    this.isSeeking.set(false);
    this.arePlayerControlsVisible.set(false);
    this.playbackBubble.set(null);
    this.bursts.set([]);
    this.scoreSubmissionStatus.set('idle');
    this.leaderboard.set(null);
    this.leaderboardStatus.set('idle');
    this.unlockedNames.set([]);
    this.submittedRoundId = null;
    this.item.set(item);

    if (gameCode !== null && item.type === 'game') {
      const { width, height } = await waitForSize(this.gameHost().nativeElement, LAYOUT_TIMEOUT_MS);
      if (this.destroyRef.destroyed || this.item() !== item) return;
      this.session()?.start(gameCode, {
        username: this.username() ?? '',
        data: gameItem?.data ?? {
          context: `"${item.title}", a short game in a learning feed.`,
        },
        width,
        height,
      });
      this.syncGameLifecycle();
    }
  }

  private showSeekTimestamp(): void {
    if (this.seekTimestampTimer !== null) clearTimeout(this.seekTimestampTimer);
    this.isSeeking.set(true);
  }

  private hideSeekTimestampSoon(): void {
    if (this.seekTimestampTimer !== null) clearTimeout(this.seekTimestampTimer);
    this.seekTimestampTimer = setTimeout(() => {
      this.isSeeking.set(false);
      this.seekTimestampTimer = null;
    }, 700);
  }

  private showPlaybackBubble(action: PlaybackBubble): void {
    if (this.playbackBubbleTimer !== null) clearTimeout(this.playbackBubbleTimer);
    this.playbackBubble.set(action);
    this.playbackBubbleTimer = setTimeout(() => {
      this.playbackBubble.set(null);
      this.playbackBubbleTimer = null;
    }, 500);
  }

  private showPlayerControls(): void {
    if (this.playerControlsTimer !== null) clearTimeout(this.playerControlsTimer);
    this.arePlayerControlsVisible.set(true);
    this.playerControlsTimer = setTimeout(() => {
      this.arePlayerControlsVisible.set(false);
      this.playerControlsTimer = null;
    }, 2_000);
  }
}

async function loadGameCode(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load game (${res.status})`);
  return res.text();
}

function describeError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 401) return 'Please log in to see your feed.';
    return `Server error (${err.status}).`;
  }
  return err instanceof Error ? err.message : String(err);
}

function formatTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}
