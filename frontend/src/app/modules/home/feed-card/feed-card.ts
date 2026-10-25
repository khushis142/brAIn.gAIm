import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  LucideBrain,
  LucideChevronDown,
  LucideChevronUp,
  LucideLock,
  LucideVolume1,
  LucideVolume2,
  LucideVolumeX,
} from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService, LikeState } from '../../../core/api.service';
import { GameResult } from '../../../engine/gameProtocol';
import { CardTransition, describeError, FeedEntry, FeedSound, GameAllowance } from '../feed';
import { FeedGame } from '../feed-game/feed-game';
import { FeedVideo } from '../feed-video/feed-video';

const SLIDER_HIDE_MS = 3000; // after the last touch on the sound control

/**
 * One feed item. The card stays for as long as its item is in the history; its video or
 * game only exists while it is `live`, and its entry remembers where that was left off.
 */
@Component({
  imports: [
    FeedGame,
    FeedVideo,
    LucideBrain,
    LucideChevronDown,
    LucideChevronUp,
    LucideLock,
    LucideVolume1,
    LucideVolume2,
    LucideVolumeX,
  ],
  selector: 'app-feed-card',
  styleUrl: './feed-card.css',
  templateUrl: './feed-card.html',
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class FeedCard {
  readonly entry = input.required<FeedEntry>();
  /** Keeps the video or game mounted, so coming back resumes it as it was */
  readonly live = input(false);
  /** This is the card on screen */
  readonly active = input(false);
  readonly transition = input<CardTransition>(null);
  readonly hasPrevious = input(false);
  readonly next = output<void>();
  readonly previous = output<void>();
  readonly likeChanged = output<LikeState>();

  private readonly api = inject(ApiService);
  private readonly game = viewChild(FeedGame);
  private readonly soundControl = viewChild.required<ElementRef<HTMLElement>>('soundControl');
  protected readonly sound = inject(FeedSound);
  /** What the slider shows: muted reads as zero */
  protected readonly volume = computed(() => (this.sound.muted() ? 0 : this.sound.volume()));
  /** Touch has no hover, so a tap on the sound control keeps the slider open for a while */
  protected readonly sliderOpen = signal(false);
  private sliderTimer: ReturnType<typeof setTimeout> | null = null;
  readonly gameOwnsInput = computed(() => this.game()?.ownsInput() ?? false);

  protected readonly allowance = computed<GameAllowance>(() => {
    if (!this.active() || this.transition() === 'leaving') return 'paused';
    return this.transition() === 'entering' ? 'visible' : 'playing';
  });
  protected readonly liked = computed(() => {
    const item = this.entry().item;
    return item.type === 'video' && item.liked;
  });
  protected readonly likeCount = computed(() => {
    const item = this.entry().item;
    return item.type === 'video' ? item.like_count : 0;
  });
  protected readonly likePending = signal(false);
  protected readonly likeError = signal<string | null>(null);
  protected readonly gameResult = linkedSignal(() => this.entry().saved.gameResult);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearSliderTimer());
  }

  protected onVolumeInput(event: Event): void {
    this.sound.setVolume((event.target as HTMLInputElement).valueAsNumber);
  }

  /** Holds the slider open while a finger is on the control */
  protected onSoundPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') this.clearSliderTimer();
  }

  protected onSoundPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'mouse') return; // the mouse has hover
    this.sliderOpen.set(true);
    this.clearSliderTimer();
    this.sliderTimer = setTimeout(() => {
      this.sliderTimer = null;
      this.sliderOpen.set(false);
    }, SLIDER_HIDE_MS);
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.sliderOpen() || this.soundControl().nativeElement.contains(event.target as Node)) {
      return;
    }
    this.clearSliderTimer();
    this.sliderOpen.set(false);
  }

  private clearSliderTimer(): void {
    if (this.sliderTimer !== null) clearTimeout(this.sliderTimer);
    this.sliderTimer = null;
  }

  protected get videoTime(): number {
    return this.entry().saved.videoTime;
  }

  protected setVideoTime(time: number): void {
    this.entry().saved.videoTime = time;
  }

  protected setGameResult(result: GameResult): void {
    this.gameResult.set(result);
    this.entry().saved.gameResult = result;
  }

  protected async setLiked(liked: boolean): Promise<void> {
    const item = this.entry().item;
    if (item.type !== 'video' || this.likePending() || item.liked === liked) return;

    this.likePending.set(true);
    this.likeError.set(null);
    try {
      this.likeChanged.emit(await firstValueFrom(this.api.setContentLike(item.id, liked)));
    } catch (error) {
      this.likeError.set(`Couldn't update like. ${describeError(error)}`);
    } finally {
      this.likePending.set(false);
    }
  }
}
