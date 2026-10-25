import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService, FeedItem } from '../../core/api.service';

/** One item in the feed history. The key stays the same while the item is in the history. */
export interface FeedEntry {
  readonly key: number;
  readonly item: FeedItem;
}

/** Where a card stands in the feed transition, if it is the one on screen */
export type CardTransition = 'leaving' | 'entering' | null;

/**
 * How far the feed lets a card's game run: paused off screen or while leaving,
 * visible while entering, playing once the card has settled.
 */
export type GameAllowance = 'paused' | 'visible' | 'playing';

/** The signed-in username, fetched once per feed and shared by all of its games */
@Injectable()
export class FeedUser {
  private readonly api = inject(ApiService);
  private request?: Promise<string>;

  username(): Promise<string> {
    this.request ??= firstValueFrom(this.api.getMe()).then(
      (me) => me.username,
      (error: unknown) => {
        this.request = undefined; // let the next game try again
        throw error;
      },
    );
    return this.request;
  }
}

/**
 * Stats for this visit to the website. They live in memory, so they survive leaving the
 * feed and coming back, and start over the next time the site is opened or reloaded.
 */
@Injectable({ providedIn: 'root' })
export class FeedSession {
  readonly startedAt = Date.now();
  // By entry, not key: keys start over with every feed, entries do not
  private readonly seenVideos = new WeakSet<FeedEntry>();
  private readonly _videosWatched = signal(0);
  readonly videosWatched = this._videosWatched.asReadonly();

  /** Counts each video in the history once, however often the user scrolls back to it */
  shown(entry: FeedEntry): void {
    if (entry.item.type !== 'video' || this.seenVideos.has(entry)) return;
    this.seenVideos.add(entry);
    this._videosWatched.update((count) => count + 1);
  }
}

export const wait =(ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function describeError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 401) return 'Please log in to see your feed.';
    return `Server error (${err.status}).`;
  }
  return err instanceof Error ? err.message : String(err);
}
