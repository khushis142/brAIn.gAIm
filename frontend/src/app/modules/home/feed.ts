import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
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

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function describeError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 401) return 'Please log in to see your feed.';
    return `Server error (${err.status}).`;
  }
  return err instanceof Error ? err.message : String(err);
}
