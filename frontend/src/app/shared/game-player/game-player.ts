import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideRotateCcw, LucideTrophy, LucideX } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService, LeaderboardEntry } from '../../core/api.service';
import { GameEngineService } from '../../engine/gameEngineService';
import { GameCustomData, GameResult } from '../../engine/gameProtocol';
import { GameSession } from '../../engine/gameSession';

export interface GamePlayable {
  id: string;
  title: string;
  url: string;
  round_id?: string;
  data?: GameCustomData;
}

export function defaultGameData(title: string): GameCustomData {
  const safeTitle = title.length > 30 ? title.slice(0, 30) : title;
  return {
    context: `BrainGain: ${safeTitle}`,
    difficulty: 'normal',
    pauseTitle: `${safeTitle} Paused`,
    pauseMessage: 'Take a quick break or continue when ready.',
    resumeLabel: 'Resume Play',
    leaderboardTitle: `${safeTitle} Rankings`,
    leaderboardSubtitle: 'Top learners',
    scoreLabel: 'Points',
    chains: [
      {
        title: 'Scientific Method',
        steps: ['Observe', 'Hypothesize', 'Experiment', 'Analyze', 'Conclude'],
        decoys: ['Guess', 'Ignore data'],
      },
      {
        title: 'Water Cycle',
        steps: ['Evaporation', 'Condensation', 'Precipitation', 'Collection'],
        decoys: ['Combustion'],
      },
    ],
    questions: [
      {
        question: "What is the primary power source of Earth's climate system?",
        options: ['The Sun', 'The Moon', 'Geothermal vents', 'Ocean currents'],
        answer: 0,
        left_option: 'The Sun',
        right_option: 'The Moon',
        correct: 'left',
        answer_correct: 'The Sun',
        answer_incorrect: 'The Moon',
        answer_incorrect2: 'Ocean currents',
      },
      {
        question: 'Which organ in the human body consumes the most energy?',
        options: ['Brain', 'Heart', 'Liver', 'Kidneys'],
        answer: 0,
        left_option: 'Brain',
        right_option: 'Heart',
        correct: 'left',
        answer_correct: 'Brain',
        answer_incorrect: 'Heart',
        answer_incorrect2: 'Liver',
      },
      {
        question: 'Which data structure operates on a Last-In-First-Out (LIFO) basis?',
        options: ['Stack', 'Queue', 'Array', 'Linked List'],
        answer: 0,
        left_option: 'Stack',
        right_option: 'Queue',
        correct: 'left',
        answer_correct: 'Stack',
        answer_incorrect: 'Queue',
        answer_incorrect2: 'Array',
      },
      {
        question: 'What is the speed of light in vacuum (approximate)?',
        options: ['300,000 km/s', '150,000 km/s', '3,000 km/s', '3,000,000 km/s'],
        answer: 0,
        left_option: '300,000 km/s',
        right_option: '150,000 km/s',
        correct: 'left',
        answer_correct: '300,000 km/s',
        answer_incorrect: '150,000 km/s',
        answer_incorrect2: '3,000 km/s',
      },
    ],
  };
}

export function resolveGameData(title: string, custom?: GameCustomData): GameCustomData {
  const fallback = defaultGameData(title);
  if (!custom || Object.keys(custom).length === 0) {
    return fallback;
  }
  return {
    ...fallback,
    ...custom,
    questions:
      Array.isArray(custom['questions']) && custom['questions'].length > 0
        ? custom['questions']
        : fallback['questions'],
    chains:
      Array.isArray(custom['chains']) && custom['chains'].length > 0
        ? custom['chains']
        : fallback['chains'],
    difficulty:
      typeof custom['difficulty'] === 'string' &&
      ['easy', 'normal', 'hard'].includes(custom['difficulty'])
        ? custom['difficulty']
        : 'normal',
  };
}

@Component({
  imports: [LucideRotateCcw, LucideTrophy, LucideX],
  selector: 'app-game-player',
  styleUrl: './game-player.css',
  templateUrl: './game-player.html',
  host: {
    '(window:resize)': 'onResize()',
  },
})
export class GamePlayer {
  private readonly api = inject(ApiService);
  private readonly engine = inject(GameEngineService);
  private readonly gameHost = viewChild.required<ElementRef<HTMLElement>>('gameHost');

  readonly game = input<GamePlayable | null>(null);
  readonly active = input(true);
  readonly showControls = input(true);
  readonly autoSubmitScore = input(true);

  readonly close = output<void>();
  readonly next = output<void>();
  readonly result = output<GameResult>();
  readonly scoreSubmitted = output<number>();

  protected readonly session = signal<GameSession | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly gameResult = signal<GameResult | null>(null);
  protected readonly leaderboard = signal<LeaderboardEntry[] | null>(null);
  protected readonly showLeaderboard = signal(false);
  protected readonly isSubmitting = signal(false);

  protected readonly error = computed(
    () => this.loadError() ?? this.session()?.error() ?? null,
  );

  private cachedGameCode: { url: string; code: string } | null = null;
  private username: string | null = null;
  private submittedResult: GameResult | null = null;
  private currentGameId: string | null = null;
  private busy = false;

  constructor() {
    afterNextRender(() => {
      this.session.set(this.engine.createSession(this.gameHost().nativeElement));
      void this.loadAndStart();
    });

    const destroyRef = inject(DestroyRef);
    const onVisibilityChange = () => this.syncLifecycle();
    document.addEventListener('visibilitychange', onVisibilityChange);

    destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      this.session()?.destroy();
    });

    // Effect to react when active() changes
    effect(() => {
      const isAct = this.active();
      this.syncLifecycle();
    });

    // Effect to react when game() changes
    effect(() => {
      const g = this.game();
      const sess = this.session();
      if (sess && g && g.id !== this.currentGameId) {
        void this.loadAndStart();
      }
    });

    // Effect to watch session result
    effect(() => {
      const sess = this.session();
      const res = sess?.result();
      if (res && res !== this.submittedResult) {
        this.submittedResult = res;
        this.gameResult.set(res);
        this.result.emit(res);
        if (this.autoSubmitScore()) {
          void this.submitScore(res.score);
        }
      }
    });
  }

  async loadAndStart(): Promise<void> {
    const current = this.game();
    if (!current) {
      this.session()?.stop();
      this.currentGameId = null;
      return;
    }

    if (this.busy) return;
    this.busy = true;
    this.currentGameId = current.id;
    this.loading.set(true);
    this.loadError.set(null);
    this.gameResult.set(null);
    this.showLeaderboard.set(false);
    this.submittedResult = null;

    try {
      if (!this.cachedGameCode || this.cachedGameCode.url !== current.url) {
        const res = await fetch(current.url);
        if (!res.ok) throw new Error(`Could not load game (${res.status})`);
        const code = await res.text();
        this.cachedGameCode = { url: current.url, code };
      }

      if (!this.username) {
        try {
          this.username = (await firstValueFrom(this.api.getMe())).username;
        } catch {
          this.username = 'Player';
        }
      }

      const host = this.gameHost().nativeElement;
      const width = host.clientWidth > 0 ? host.clientWidth : 800;
      const height = host.clientHeight > 0 ? host.clientHeight : 600;

      this.session()?.stop();
      this.session()?.start(this.cachedGameCode.code, {
        username: this.username ?? 'Player',
        data: resolveGameData(current.title, current.data),
        width,
        height,
      });

      this.syncLifecycle();
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
      this.busy = false;
    }
  }

  restart(): void {
    void this.loadAndStart();
  }

  async toggleLeaderboard(): Promise<void> {
    if (this.showLeaderboard()) {
      this.showLeaderboard.set(false);
      return;
    }

    const current = this.game();
    if (!current) return;

    this.showLeaderboard.set(true);
    try {
      const board = await firstValueFrom(this.api.getLeaderboard(current.id, 10));
      this.leaderboard.set(board);
    } catch {
      this.leaderboard.set([]);
    }
  }

  private async submitScore(score: number): Promise<void> {
    const current = this.game();
    if (!current) return;

    this.isSubmitting.set(true);
    try {
      await firstValueFrom(
        this.api.submitScore(current.id, {
          score: Math.max(0, score),
          round_id: current.round_id,
        }),
      );
      this.scoreSubmitted.emit(score);
    } catch {
      // Score submission failure should not block the user
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected onResize(): void {
    const host = this.gameHost()?.nativeElement;
    if (host && host.clientWidth > 0 && host.clientHeight > 0) {
      this.session()?.resize(host.clientWidth, host.clientHeight);
    }
  }

  syncLifecycle(): void {
    const session = this.session();
    if (!session) return;

    if (session.result() !== null) {
      session.setLifecycle('completed');
      return;
    }

    if (document.visibilityState === 'hidden' || !this.active()) {
      session.setLifecycle('paused');
      return;
    }

    session.focus();
    session.setLifecycle('playing');
  }
}
