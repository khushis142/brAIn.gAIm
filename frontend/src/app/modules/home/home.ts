import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LucideChevronDown } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService, FeedItem } from '../../core/api.service';
import { GameEngineService } from '../../engine/gameEngineService';
import { GameSession } from '../../engine/gameSession';

type Phase = 'idle' | 'leaving' | 'entering';
type PlaybackBubble = 'play' | 'pause';

const LEAVE_MS = 450; // keep in sync with the animations in home.css
const ENTER_MS = 450;
const SWIPE_MIN_PX = 60;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Component({
  imports: [LucideChevronDown],
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
  private readonly gameHost = viewChild.required<ElementRef<HTMLElement>>('gameHost');
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

  private busy = false;
  private username: string | null = null;
  private touchStartY: number | null = null;
  private seekTimestampTimer: ReturnType<typeof setTimeout> | null = null;
  private playbackBubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private playerControlsTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Runs in the browser after the first render, when #gameHost exists
    afterNextRender(() => {
      this.session.set(this.engine.createSession(this.gameHost().nativeElement));
      this.next();
    });
    inject(DestroyRef).onDestroy(() => {
      this.session()?.destroy();
      if (this.seekTimestampTimer !== null) clearTimeout(this.seekTimestampTimer);
      if (this.playbackBubbleTimer !== null) clearTimeout(this.playbackBubbleTimer);
      if (this.playerControlsTimer !== null) clearTimeout(this.playerControlsTimer);
    });
  }

  protected async next(): Promise<void> {
    if (this.busy) return; // ignore input while a transition is running
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
