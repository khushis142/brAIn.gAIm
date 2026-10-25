import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { LucideBrain, LucideChevronDown, LucideChevronUp, LucideLock } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService, LikeState } from '../../../core/api.service';
import { GameResult } from '../../../engine/gameProtocol';
import { CardTransition, describeError, FeedEntry, GameAllowance } from '../feed';
import { FeedGame } from '../feed-game/feed-game';
import { FeedVideo } from '../feed-video/feed-video';

/**
 * One feed item. The card stays for as long as its item is in the history; its video or
 * game only exists while it is `live`, and the card remembers where that was left off.
 */
@Component({
  imports: [FeedGame, FeedVideo, LucideBrain, LucideChevronDown, LucideChevronUp, LucideLock],
  selector: 'app-feed-card',
  styleUrl: './feed-card.css',
  templateUrl: './feed-card.html',
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
  protected readonly gameResult = signal<GameResult | null>(null);
  protected videoTime = 0;

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
