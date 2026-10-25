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
import { ApiService, LeaderboardEntry, ZombieRead } from '../../core/api.service';
import { GamePrefetchService } from '../../core/game-prefetch.service';
import { ZombieService } from '../../core/zombie.service';
import { GameAssetManifest } from '../../engine/gameProtocol';
import { inlineGameAssets, toDataUrl } from '../../engine/gameAssets';
import { GameEngineService } from '../../engine/gameEngineService';
import { GameCustomData, GameResult } from '../../engine/gameProtocol';
import { GameSession } from '../../engine/gameSession';

export interface GamePlayable {
  id: string;
  title: string;
  url: string;
  round_id?: string;
  data?: GameCustomData;
  assets?: string[];
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
        correctAnswer: 'The Sun',
        wrongAnswer: 'The Moon',
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
        correctAnswer: 'Brain',
        wrongAnswer: 'Heart',
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
        correctAnswer: 'Stack',
        wrongAnswer: 'Queue',
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
        correctAnswer: '300,000 km/s',
        wrongAnswer: '150,000 km/s',
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

function normalizeQuestions(raw: unknown[]): Record<string, unknown>[] {
  return raw.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      return {
        question: `Question ${idx + 1}`,
        correctAnswer: 'Correct',
        wrongAnswer: 'Incorrect',
        options: ['Correct', 'Incorrect'],
        answer: 0,
      };
    }
    const q = item as Record<string, unknown>;
    const questionText =
      typeof q['question'] === 'string' && q['question'].trim()
        ? q['question'].trim()
        : `Question ${idx + 1}`;
    const options =
      Array.isArray(q['options']) && q['options'].length > 0 ? (q['options'] as string[]) : [];
    const answerIdx = typeof q['answer'] === 'number' ? q['answer'] : 0;
    const answer = typeof q['answer'] === 'boolean' ? q['answer'] : answerIdx;

    const correctAns =
      (typeof q['correctAnswer'] === 'string' && q['correctAnswer'].trim()) ||
      (typeof q['answer_correct'] === 'string' && q['answer_correct'].trim()) ||
      (typeof q['left_option'] === 'string' && q['left_option'].trim()) ||
      (options[answerIdx] && String(options[answerIdx]).trim()) ||
      'Correct';

    const wrongAns =
      (typeof q['wrongAnswer'] === 'string' && q['wrongAnswer'].trim()) ||
      (typeof q['answer_incorrect'] === 'string' && q['answer_incorrect'].trim()) ||
      (typeof q['right_option'] === 'string' && q['right_option'].trim()) ||
      (options[answerIdx === 0 ? 1 : 0] && String(options[answerIdx === 0 ? 1 : 0]).trim()) ||
      'Incorrect';

    return {
      ...q,
      question: questionText,
      correctAnswer: correctAns,
      wrongAnswer: wrongAns,
      answer_correct: q['answer_correct'] ?? correctAns,
      answer_incorrect: q['answer_incorrect'] ?? wrongAns,
      left_option: q['left_option'] ?? correctAns,
      right_option: q['right_option'] ?? wrongAns,
      correct: q['correct'] ?? 'left',
      options: options.length >= 2 ? options : [correctAns, wrongAns],
      answer,
    };
  });
}

export function resolveGameData(title: string, custom?: GameCustomData): GameCustomData {
  const fallback = defaultGameData(title);
  const base = !custom || Object.keys(custom).length === 0 ? fallback : { ...fallback, ...custom };
  const rawQuestions =
    Array.isArray(custom?.['questions']) && custom!['questions'].length > 0
      ? custom!['questions']
      : fallback['questions'];

  return {
    ...base,
    questions: normalizeQuestions(rawQuestions as unknown[]),
    chains:
      Array.isArray(custom?.['chains']) && custom!['chains'].length > 0
        ? custom!['chains']
        : fallback['chains'],
    difficulty:
      typeof custom?.['difficulty'] === 'string' &&
      ['easy', 'normal', 'hard'].includes(custom['difficulty'])
        ? custom['difficulty']
        : 'normal',
  };
}

const ZOMBIE_AVATARS: Readonly<Record<string, string>> = {
  zombie: 'zombie.svg',
  'half-human': 'half-human.svg',
  human: 'human.svg',
};

const ZOMBIE_ACCESSORIES: Readonly<Record<string, string>> = {
  hat: 'hat.svg',
  sunglasses: 'sunglasses.svg',
  'gold-chain': 'gold-chain.svg',
  'red-sneakers': 'red-sneakers.svg',
};

export function zombieGameAssets(state: ZombieRead | null, baseUrl: string): GameAssetManifest {
  const manifest: Record<string, GameAssetManifest[string]> = {};
  const add = (id: string, filename: string): void => {
    manifest[id] = {
      kind: 'image',
      url: new URL(`/assets/zombie/${filename}`, baseUrl).href,
      maxBytes: 64 * 1024,
    };
  };

  const avatar = state?.avatar ?? 'zombie';
  add('player-zombie', ZOMBIE_AVATARS[avatar] ?? ZOMBIE_AVATARS['zombie']);
  for (const accessory of Object.values(state?.equipped ?? {})) {
    if (typeof accessory !== 'string') continue;
    const filename = ZOMBIE_ACCESSORIES[accessory];
    if (filename) add(`player-zombie-${accessory}`, filename);
  }
  return manifest;
}

/** The sandboxed game can't fetch the app origin (CORS, http), so the art is handed over as data: URLs. */
async function inlinePlayerAssets(manifest: GameAssetManifest): Promise<GameAssetManifest> {
  const inlined: Record<string, GameAssetManifest[string]> = {};
  await Promise.all(
    Object.entries(manifest).map(async ([id, asset]) => {
      try {
        inlined[id] = { ...asset, url: await toDataUrl(asset.url) };
      } catch (error) {
        console.warn(`Could not load the zombie asset ${id}`, error);
      }
    }),
  );
  return inlined;
}

@Component({
  imports: [LucideRotateCcw, LucideTrophy, LucideX],
  selector: 'app-game-player',
  styleUrl: './game-player.css',
  templateUrl: './game-player.html',
  host: {
    '(window:resize)': 'onResize()',
    '(click)': 'focus()',
  },
})
export class GamePlayer {
  private readonly api = inject(ApiService);
  private readonly prefetch = inject(GamePrefetchService);
  private readonly engine = inject(GameEngineService);
  private readonly zombie = inject(ZombieService);
  private readonly gameHost = viewChild.required<ElementRef<HTMLElement>>('gameHost');

  readonly game = input<GamePlayable | null>(null);
  readonly active = input(true);
  readonly showControls = input(true);
  readonly showTitle = input(false);
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

  protected readonly error = computed(() => this.loadError() ?? this.session()?.error() ?? null);

  private cachedGameCode: { url: string; code: string } | null = null;
  private username: string | null = null;
  private submittedResult: GameResult | null = null;
  private currentGameId: string | null = null;
  private currentRoundId: string | null = null;
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

  async loadAndStart(forceNewRound = false): Promise<void> {
    const current = this.game();
    if (!current) {
      this.session()?.stop();
      this.currentGameId = null;
      this.currentRoundId = null;
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
      const codePromise =
        !this.cachedGameCode || this.cachedGameCode.url !== current.url
          ? fetch(current.url).then(async (res) => {
              if (!res.ok) throw new Error(`Could not load game (${res.status})`);
              const code = await res.text();
              this.cachedGameCode = { url: current.url, code };
              return code;
            })
          : Promise.resolve(this.cachedGameCode.code);

      const usernamePromise = !this.username
        ? firstValueFrom(this.api.getMe())
            .then((me) => {
              this.username = me.username;
            })
            .catch(() => {
              this.username = 'Player';
            })
        : Promise.resolve();

      let roundData = current.data;
      let roundId = current.round_id;
      let roundAssets = current.assets;
      if (!roundData || Object.keys(roundData).length === 0 || forceNewRound) {
        try {
          const prefetched = await this.prefetch.consume(current.id);
          const item = prefetched ?? (await firstValueFrom(this.api.playGame(current.id)));
          if (item?.data && Object.keys(item.data).length > 0) {
            roundData = item.data;
            roundId = item.round_id;
            roundAssets = item.assets;
          }
        } catch (err) {
          console.warn('Could not fetch AI game round, using fallback data', err);
        }
      }

      this.currentRoundId = roundId ?? current.round_id ?? null;
      const [code, data] = await Promise.all([
        codePromise,
        inlineGameAssets(resolveGameData(current.title, roundData), roundAssets),
        usernamePromise,
      ]);
      if (!this.zombie.state()) {
        try {
          await this.zombie.refresh();
        } catch (error) {
          console.warn('Could not load the player zombie for the game', error);
        }
      }
      const playerAssets = await inlinePlayerAssets(
        zombieGameAssets(this.zombie.state(), document.baseURI),
      );

      const host = this.gameHost().nativeElement;
      const width = host.clientWidth > 0 ? host.clientWidth : 800;
      const height = host.clientHeight > 0 ? host.clientHeight : 600;

      this.session()?.stop();
      this.session()?.start(code, {
        username: this.username ?? 'Player',
        data,
        width,
        height,
        assets: playerAssets,
      });

      this.syncLifecycle();

      // Pre-warm the NEXT round in background for seamless restart
      this.prefetch.prefetch(current.id);
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
      this.busy = false;
    }
  }

  focus(): void {
    this.session()?.focus();
  }

  restart(): void {
    void this.loadAndStart(true);
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
          round_id: this.currentRoundId ?? current.round_id,
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
