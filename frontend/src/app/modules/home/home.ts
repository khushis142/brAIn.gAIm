import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideBrain, LucideChevronDown } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService, FeedItem, GameItem } from '../../core/api.service';
import { ZombieService } from '../../core/zombie.service';
import { GameEngineService } from '../../engine/gameEngineService';
import { GameSession } from '../../engine/gameSession';
import { Zombie } from '../../shared/zombie/zombie';

type Phase = 'idle' | 'leaving' | 'entering';
type PlaybackBubble = 'play' | 'pause';

const LEAVE_MS = 450; // keep in sync with the animations in home.css
const ENTER_MS = 450;
const SWIPE_MIN_PX = 60;
const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 10; // more movement than this is a swipe, not a tap
const BURST_MS = 800; // keep in sync with the burst animation in home.css

interface Burst {
  id: number;
  x: number;
  y: number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  /** Accessories unlocked by the game on screen */
  protected readonly unlockedNames = signal<string[]>([]);

  private busy = false;
  private username: string | null = null;
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
  private windowFocused = true;

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
      const current = untracked(this.item);
      if (result && current?.type === 'game') untracked(() => this.submitScore(current, result.score));
    });
    const destroyRef = inject(DestroyRef);
    const view = document.defaultView;
    const onVisibilityChange = () => this.syncGameLifecycle();
    const onFocus = () => {
      this.windowFocused = true;
      this.syncGameLifecycle();
    };
    const onBlur = () => {
      this.windowFocused = false;
      this.syncGameLifecycle();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    view?.addEventListener('focus', onFocus);
    view?.addEventListener('blur', onBlur);
    destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      view?.removeEventListener('focus', onFocus);
      view?.removeEventListener('blur', onBlur);
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
    if (document.visibilityState === 'hidden' || !this.windowFocused || this.visibleRatio === 0) {
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
      this.busy = false;
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault(); // stop the page from scrolling
    this.next();
  }

  protected onTouchStart(event: TouchEvent): void {
    // Swipes during a game belong to the game; the ↓ button still moves on
    this.touchStartY = this.item()?.type === 'game' ? null : event.touches[0].clientY;
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

  private async submitScore(game: GameItem, score: number): Promise<void> {
    try {
      // The backend rejects negative scores, but the finished game should still count
      const { newly_unlocked, newly_unlocked_avatars } = await firstValueFrom(
        this.api.submitScore(game.id, { score: Math.max(0, score), round_id: game.round_id }),
      );
      if (newly_unlocked.length === 0 && newly_unlocked_avatars.length === 0) return;
      await this.zombie.load();
      if (this.item() === game) {
        this.unlockedNames.set([
          ...newly_unlocked_avatars.map((id) => `${this.zombie.avatarName(id)} avatar`),
          ...newly_unlocked.map((id) => this.zombie.accessoryName(id)),
        ]);
      }
    } catch (err) {
      // A lost score must not interrupt the feed
      console.warn('Could not save game score', err);
    }
  }

  private setLiked(id: string, liked: boolean): void {
    this.likedIds.update((ids) => {
      const next = new Set(ids);
      if (liked) next.add(id);
      else next.delete(id);
      return next;
    });
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
    if (gameItem !== null) this.username ??= (await firstValueFrom(this.api.getMe())).username;

    this.session()?.stop();
    this.clearTimers();
    this.currentTime.set(0);
    this.duration.set(0);
    this.isPlaying.set(true);
    this.isSeeking.set(false);
    this.arePlayerControlsVisible.set(false);
    this.playbackBubble.set(null);
    this.bursts.set([]);
    this.unlockedNames.set([]);
    this.item.set(item);

    if (gameCode !== null && item.type === 'game') {
      const host = this.gameHost().nativeElement;
      this.session()?.start(gameCode, {
        username: this.username ?? '',
        data: gameItem?.data ?? {
          context: `"${item.title}", a short game in a learning feed.`,
        },
        width: host.clientWidth,
        height: host.clientHeight,
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
