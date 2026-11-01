import { afterNextRender, Component, computed, inject, signal, viewChildren } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService, LikeState } from '../../core/api.service';
import { ZombieService } from '../../core/zombie.service';
import { CardTransition, describeError, FeedEntry, FeedHistory, FeedSession, FeedUser, wait } from './feed';
import { FeedCard } from './feed-card/feed-card';

type Phase = 'idle' | 'leaving' | 'entering';
type Direction = 'forward' | 'back';

const LEAVE_MS = 450; // keep in sync with the animations in home.css
const ENTER_MS = 450;
const SWIPE_MIN_PX = 60;
const HISTORY_LIMIT = 20; // items you can scroll back through; older ones drop off
// Cards this many steps from the current one keep their video or game mounted, so coming
// back resumes it as it was. Further away they unmount and remember only where they were.
const KEEP_ALIVE = 2;

@Component({
  imports: [FeedCard],
  providers: [FeedUser],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
  host: {
    '(window:keydown)': 'onKeydown($event)',
  },
})
export class Home {
  private readonly api = inject(ApiService);
  private readonly zombie = inject(ZombieService);
  private readonly session = inject(FeedSession);
  private readonly history = inject(FeedHistory);
  private readonly cards = viewChildren(FeedCard);

  protected readonly entries = this.history.entries;
  protected readonly index = this.history.index;
  protected readonly phase = signal<Phase>('idle');
  protected readonly direction = signal<Direction>('forward');
  protected readonly transition = computed<CardTransition>(() => {
    const phase = this.phase();
    return phase === 'idle' ? null : phase;
  });
  protected readonly error = signal<string | null>(null);
  private readonly current = computed(() => this.entries()[this.index()] ?? null);
  /**
   * A game being played gets swipes and arrow keys, and has to be finished before the feed
   * moves on. Going back is still allowed; coming forward again lands on the same game.
   */
  protected readonly gameOwnsInput = computed(
    () =>
      this.cards()
        .find((card) => card.entry() === this.current())
        ?.gameOwnsInput() ?? false,
  );

  private busy = false;
  private touchStartY: number | null = null;

  constructor() {
    afterNextRender(() => {
      // Coming back from another tab shows the item that was left, not a new one
      if (!this.current()) void this.next();
      // The mascot is decoration; without it the result screen still works
      this.zombie.load().catch(() => {});
    });
  }

  protected isLive(index: number): boolean {
    return Math.abs(index - this.index()) <= KEEP_ALIVE;
  }

  /** Moves forward through the history, fetching a new item at its end */
  protected next(): Promise<void> {
    if (this.gameOwnsInput()) return Promise.resolve();
    return this.move('forward', async () => {
      if (this.index() < this.entries().length - 1) return this.index() + 1;
      return this.append(await firstValueFrom(this.api.nextItem()));
    });
  }

  protected previous(): Promise<void> {
    if (this.index() <= 0) return Promise.resolve();
    return this.move('back', async () => this.index() - 1);
  }

  protected updateLike(entry: FeedEntry, likeState: LikeState): void {
    this.entries.update((entries) =>
      entries.map((current) =>
        current.key === entry.key && current.item.type === 'video'
          ? { ...current, item: { ...current.item, ...likeState } }
          : current,
      ),
    );
  }

  private append(item: FeedEntry['item']): number {
    const entries = [...this.entries(), this.history.createEntry(item)];
    const dropped = Math.max(0, entries.length - HISTORY_LIMIT);
    this.entries.set(entries.slice(dropped));
    this.index.update((index) => index - dropped);
    return this.entries().length - 1;
  }

  private async move(direction: Direction, target: () => Promise<number>): Promise<void> {
    if (this.busy) return; // ignore input while a transition is running
    this.busy = true;
    this.error.set(null);
    this.direction.set(direction);
    const hasItem = this.current() !== null;
    if (hasItem) this.phase.set('leaving');

    try {
      // Fetch the next item while the leave animation plays
      const [nextIndex] = await Promise.all([target(), wait(hasItem ? LEAVE_MS : 0)]);
      this.index.set(nextIndex);
      this.session.shown(this.entries()[nextIndex]);
      this.phase.set('entering');
      await wait(ENTER_MS);
    } catch (err) {
      this.error.set(describeError(err));
    } finally {
      this.phase.set('idle');
      this.busy = false;
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || this.gameOwnsInput()) return;
    if (event.target instanceof HTMLInputElement) return; // e.g. the volume slider
    event.preventDefault(); // stop the page from scrolling
    void (event.key === 'ArrowDown' ? this.next() : this.previous());
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartY = this.gameOwnsInput() ? null : event.touches[0].clientY;
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (this.touchStartY === null) return;
    const swipedUp = this.touchStartY - event.changedTouches[0].clientY;
    this.touchStartY = null;
    if (swipedUp > SWIPE_MIN_PX) void this.next();
    else if (swipedUp < -SWIPE_MIN_PX) void this.previous();
  }
}
