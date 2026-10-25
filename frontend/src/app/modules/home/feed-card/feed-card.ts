import { Component, computed, input, output, signal, viewChild } from '@angular/core';
import { LucideBrain, LucideChevronDown, LucideChevronUp } from '@lucide/angular';
import { GameResult } from '../../../engine/gameProtocol';
import { CardTransition, FeedEntry, GameAllowance } from '../feed';
import { FeedGame } from '../feed-game/feed-game';
import { FeedVideo } from '../feed-video/feed-video';

/**
 * One feed item. The card stays for as long as its item is in the history; its video or
 * game only exists while it is `live`, and the card remembers where that was left off.
 */
@Component({
  imports: [FeedGame, FeedVideo, LucideBrain, LucideChevronDown, LucideChevronUp],
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

  private readonly game = viewChild(FeedGame);
  readonly gameOwnsInput = computed(() => this.game()?.ownsInput() ?? false);

  protected readonly allowance = computed<GameAllowance>(() => {
    if (!this.active() || this.transition() === 'leaving') return 'paused';
    return this.transition() === 'entering' ? 'visible' : 'playing';
  });
  // Likes are cosmetic for now: kept in memory until the backend has an endpoint
  protected readonly liked = signal(false);
  protected readonly gameResult = signal<GameResult | null>(null);
  protected videoTime = 0;
}
