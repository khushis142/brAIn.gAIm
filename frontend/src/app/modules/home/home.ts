// import { Component } from '@angular/core';

// @Component({
//   imports: [],
//   selector: 'app-home',
//   styleUrl: './home.css',
//   templateUrl: './home.html',
// })
// export class Home {}

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

  protected readonly item = signal<FeedItem | null>(null);
  protected readonly phase = signal<Phase>('idle');
  protected readonly session = signal<GameSession | null>(null);
  private readonly loadError = signal<string | null>(null);
  protected readonly error = computed(
    () =>
      this.loadError() ?? (this.item()?.type === 'game' ? this.session()?.error() : null) ?? null,
  );

  private busy = false;
  private touchStartY: number | null = null;

  constructor() {
    // Runs in the browser after the first render, when #gameHost exists
    afterNextRender(() => {
      this.session.set(this.engine.createSession(this.gameHost().nativeElement));
      this.next();
    });
    inject(DestroyRef).onDestroy(() => this.session()?.destroy());
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
    this.touchStartY = event.touches[0].clientY;
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

  private async show(item: FeedItem): Promise<void> {
    // Download game code before swapping, so a failed download keeps the current item
    const gameCode = item.type === 'game' ? await loadGameCode(item.url) : null;

    this.session()?.stop();
    this.item.set(item);

    if (gameCode !== null) {
      const host = this.gameHost().nativeElement;
      this.session()?.start(gameCode, {
        username: 'guest', // TODO: use the logged-in user once there is a login page
        data: { context: `"${item.title}", a short game in a learning feed.` },
        width: host.clientWidth,
        height: host.clientHeight,
      });
    }
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

