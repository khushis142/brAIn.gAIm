import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideBrain } from '@lucide/angular';
import { VideoItem } from '../../../core/api.service';

type PlaybackBubble = 'play' | 'pause';

const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 10; // more movement than this is a swipe, not a tap
const BURST_MS = 800; // keep in sync with the burst animation in feed-video.css

interface Burst {
  id: number;
  x: number;
  y: number;
}

/** A feed video with tap to pause, double tap to like, and a seek bar */
@Component({
  imports: [LucideBrain],
  selector: 'app-feed-video',
  styleUrl: './feed-video.css',
  templateUrl: './feed-video.html',
})
export class FeedVideo {
  readonly item = input.required<VideoItem>();
  /** Plays while true; pauses otherwise */
  readonly active = input(false);
  /** Where to resume when the card comes back into the live window */
  readonly startAt = input(0);
  readonly doubleTapped = output<void>();
  readonly timeChange = output<number>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly currentTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly isSeeking = signal(false);
  protected readonly arePlayerControlsVisible = signal(false);
  protected readonly playbackBubble = signal<PlaybackBubble | null>(null);
  protected readonly bursts = signal<Burst[]>([]);
  protected readonly playheadPercent = computed(() => {
    const duration = this.duration();
    return duration > 0 ? (this.currentTime() / duration) * 100 : 0;
  });
  protected readonly seekTimestamp = computed(() => formatTime(this.currentTime()));

  // A video the user paused stays paused when its card comes back on screen
  private pausedByUser = false;
  private seekTimestampTimer: ReturnType<typeof setTimeout> | null = null;
  private playbackBubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private playerControlsTimer: ReturnType<typeof setTimeout> | null = null;
  private singleTapTimer: ReturnType<typeof setTimeout> | null = null;
  private tapStart: { x: number; y: number } | null = null;
  private lastTapAt = -Infinity;
  private nextBurstId = 0;

  constructor() {
    afterRenderEffect(() => {
      const video = this.video().nativeElement;
      if (this.active() && !this.pausedByUser) void video.play()?.catch(() => {});
      else video.pause();
    });
    inject(DestroyRef).onDestroy(() => {
      for (const timer of [
        this.seekTimestampTimer,
        this.playbackBubbleTimer,
        this.playerControlsTimer,
        this.singleTapTimer,
      ]) {
        if (timer !== null) clearTimeout(timer);
      }
    });
  }

  protected onLoadedMetadata(event: Event): void {
    const video = event.target as HTMLVideoElement;
    this.duration.set(Number.isFinite(video.duration) ? video.duration : 0);
    if (this.startAt() > 0) video.currentTime = this.startAt();
    this.currentTime.set(video.currentTime);
  }

  protected onTimeUpdate(event: Event): void {
    const time = (event.target as HTMLVideoElement).currentTime;
    this.currentTime.set(time);
    this.timeChange.emit(time);
  }

  protected togglePlayback(): void {
    const video = this.video().nativeElement;
    this.showPlayerControls();
    if (video.paused) {
      this.pausedByUser = false;
      void video.play()?.catch(() => {});
      this.showPlaybackBubble('play');
    } else {
      this.pausedByUser = true;
      video.pause();
      this.showPlaybackBubble('pause');
    }
  }

  protected onTapStart(event: PointerEvent): void {
    this.tapStart = { x: event.clientX, y: event.clientY };
  }

  protected onTapEnd(event: PointerEvent): void {
    const start = this.tapStart;
    this.tapStart = null;
    if (start === null) return;
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
    this.doubleTapped.emit();
    const burst = { id: this.nextBurstId++, x: event.offsetX, y: event.offsetY };
    this.bursts.update((all) => [...all, burst]);
    setTimeout(() => this.bursts.update((all) => all.filter((b) => b !== burst)), BURST_MS);
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

  protected onSeekEnd(event: Event): void {
    event.stopPropagation();
    this.hideSeekTimestampSoon();
  }

  private seekToRangeValue(event: Event): void {
    const nextTime = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(nextTime)) return;
    this.video().nativeElement.currentTime = nextTime;
    this.currentTime.set(nextTime);
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

function formatTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}
