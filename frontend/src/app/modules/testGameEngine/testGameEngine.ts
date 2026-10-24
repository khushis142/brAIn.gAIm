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
import { GameEngineService } from '../../engine/gameEngineService';
import { GameSession } from '../../engine/gameSession';

@Component({
  selector: 'app-game-view',
  template: `
    <div class="flex flex-col items-start gap-3">
      <div class="flex gap-2">
        <button
          class="rounded-md bg-teal-500 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-teal-400"
          (click)="loadGame('dodge')">
          Play Dodge
        </button>
        <button
          class="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          (click)="session()?.stop()">
          Stop
        </button>
      </div>

      <div
        #host
        class="overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      </div>

      @if (error(); as message) {
        <p class="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          {{ message }}
        </p>
      }
    </div>
  `,
})
export class GameViewComponent {
  private readonly engine = inject(GameEngineService);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  protected readonly session = signal<GameSession | null>(null);
  private readonly loadError = signal<string | null>(null);
  protected readonly error = computed(
    () => this.loadError() ?? this.session()?.error() ?? null,
  );

  constructor() {
    // Runs in the browser after the first render, when #host exists
    afterNextRender(() => {
      this.session.set(this.engine.createSession(this.host().nativeElement));
    });
    inject(DestroyRef).onDestroy(() => this.session()?.destroy());
  }

  protected async loadGame(name: string): Promise<void> {
    this.loadError.set(null);
    try {
      const res = await fetch(`assets/games/${name}.js`);
      if (!res.ok) throw new Error(`Could not load ${name}.js (${res.status})`);
      this.session()?.start(await res.text());
    } catch (err) {
      this.loadError.set(String(err));
    }
  }
}