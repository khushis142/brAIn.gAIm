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
        @if (session()?.uiDesign()?.pauseMenu) {
          <button
            class="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            (click)="togglePause()">
            {{ isPaused() ? 'Resume' : 'Pause' }}
          </button>
        }
      </div>

      <div
        #host
        class="relative w-full max-w-[800px] overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
        @if (session()?.uiDesign()?.pauseMenu; as pauseMenu) {
          @if (isPaused()) {
            <section
              class="absolute inset-0 z-10 flex items-center justify-center p-6 text-center"
              [style.background-color]="overlayBackground()"
              [style.color]="overlayTextColor()">
              <div
                class="w-full max-w-sm rounded-lg border shadow-xl"
                [style.padding]="panelPadding()"
                [style.background-color]="panelBackground()"
                [style.border-color]="accentColor()">
                <p class="text-xs font-semibold uppercase tracking-wider" [style.color]="accentColor()">Paused</p>
                <h2 class="mt-1 text-2xl font-semibold">{{ pauseMenu.title }}</h2>
                @if (pauseMenu.message) {
                  <p class="mt-2 text-sm text-slate-300">{{ pauseMenu.message }}</p>
                }
                <button
                  class="mt-4 rounded-md px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110"
                  [style.background-color]="accentColor()"
                  (click)="togglePause()">
                  {{ pauseMenu.resumeLabel || 'Resume' }}
                </button>
              </div>
            </section>
          }
        }

        @if (session()?.result(); as result) {
          <section
            class="absolute inset-0 z-10 overflow-y-auto sm:p-6"
            [style.padding]="panelPadding()"
            [style.background-color]="overlayBackground()"
            [style.color]="overlayTextColor()">
            <div class="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center">
              <div class="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider" [style.color]="accentColor()">Scoreboard</p>
                  <h2 class="text-xl font-semibold">{{ session()?.uiDesign()?.leaderboard?.title || 'Run complete' }}</h2>
                  @if (session()?.uiDesign()?.leaderboard?.subtitle; as subtitle) {
                    <p class="mt-1 text-sm text-slate-300">{{ subtitle }}</p>
                  }
                </div>
                <div class="text-right">
                  <p class="text-xs text-slate-400">{{ session()?.uiDesign()?.leaderboard?.scoreLabel || 'Your score' }}</p>
                  <p class="text-3xl font-bold" [style.color]="accentColor()">{{ result.score }}</p>
                </div>
              </div>

              <div class="mb-4 grid grid-cols-2 gap-2 text-sm">
                <div class="rounded-md bg-slate-900 px-3 py-2">
                  <span class="text-slate-400">Player</span>
                  <p class="font-medium">{{ result['username'] || 'You' }}</p>
                </div>
                <div class="rounded-md bg-slate-900 px-3 py-2">
                  <span class="text-slate-400">Difficulty</span>
                  <p class="font-medium">{{ result['difficulty'] || 'Normal' }}</p>
                </div>
              </div>

              <div class="space-y-2 text-sm">
                <div class="flex justify-between rounded-md bg-slate-900 px-3 py-2">
                  <span>1. brain_runner</span>
                  <span class="font-semibold">980</span>
                </div>
                <div class="flex justify-between rounded-md bg-slate-900 px-3 py-2">
                  <span>2. focus_master</span>
                  <span class="font-semibold">760</span>
                </div>
                <div class="flex justify-between rounded-md bg-teal-950 px-3 py-2 text-teal-100">
                  <span>3. {{ result['username'] || 'You' }}</span>
                  <span class="font-semibold">{{ result.score }}</span>
                </div>
              </div>
            </div>
          </section>
        }
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
  protected readonly isPaused = signal(false);
  private readonly loadError = signal<string | null>(null);
  protected readonly error = computed(
    () => this.loadError() ?? this.session()?.error() ?? null,
  );

  protected accentColor(): string {
    const accent = this.session()?.uiDesign()?.theme?.accent ?? 'teal';
    return {
      teal: '#2dd4bf',
      amber: '#fbbf24',
      rose: '#fb7185',
      sky: '#38bdf8',
    }[accent];
  }

  protected panelBackground(): string {
    return this.session()?.uiDesign()?.theme?.panel === 'light' ? '#f8fafc' : '#1e293b';
  }

  protected overlayBackground(): string {
    return this.session()?.uiDesign()?.theme?.panel === 'light'
      ? 'rgb(15 23 42 / 0.7)'
      : 'rgb(2 6 23 / 0.88)';
  }

  protected overlayTextColor(): string {
    return this.session()?.uiDesign()?.theme?.panel === 'light' ? '#0f172a' : '#f1f5f9';
  }

  protected panelPadding(): string {
    return this.session()?.uiDesign()?.theme?.density === 'compact' ? '1rem' : '1.5rem';
  }

  constructor() {
    // Runs in the browser after the first render, when #host exists
    afterNextRender(() => {
      this.session.set(this.engine.createSession(this.host().nativeElement));
    });
    inject(DestroyRef).onDestroy(() => this.session()?.destroy());
  }

  protected async loadGame(name: string): Promise<void> {
    this.loadError.set(null);
    this.isPaused.set(false);
    try {
      const res = await fetch(`assets/games/${name}/game.js`);
      if (!res.ok) throw new Error(`Could not load ${name}/game.js (${res.status})`);
      this.session()?.start(await res.text(), {
        username: 'demo-user',
        data: {
          context: 'A short reaction game for a learning feed.',
          difficulty: 'normal',
          pauseTitle: 'Ready for a focus break?',
          pauseMessage: 'Pause safely. Your current run will be waiting.',
          resumeLabel: 'Continue Dodge',
          leaderboardTitle: 'Focus break results',
          leaderboardSubtitle: 'Your survival time from this learning feed.',
          scoreLabel: 'Focus score',
        },
      });
    } catch (err) {
      this.loadError.set(String(err));
    }
  }

  protected togglePause(): void {
    const session = this.session();
    if (!session) return;

    const wasPaused = this.isPaused();
    if (wasPaused) session.resume();
    else session.pause();
    this.isPaused.set(!wasPaused);

    if (wasPaused) {
      requestAnimationFrame(() => session.focus());
    }
  }
}