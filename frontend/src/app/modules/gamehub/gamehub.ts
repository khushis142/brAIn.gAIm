import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideArrowLeft,
  LucideGamepad2,
  LucidePlay,
  LucideRotateCcw,
  LucideSearch,
  LucideTrophy,
  LucideUser,
} from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService, ContentRead, LeaderboardEntry } from '../../core/api.service';
import { GamePrefetchService } from '../../core/game-prefetch.service';
import { GamePlayable, GamePlayer } from '../../shared/game-player/game-player';

@Component({
  imports: [
    LucideGamepad2,
    LucidePlay,
    LucideTrophy,
    LucideSearch,
    LucideUser,
    LucideArrowLeft,
    LucideRotateCcw,
    GamePlayer,
  ],
  selector: 'app-gamehub',
  styleUrl: './gamehub.css',
  templateUrl: './gamehub.html',
})
export class Gamehub implements OnInit {
  private readonly api = inject(ApiService);
  private readonly prefetch = inject(GamePrefetchService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly games = signal<ContentRead[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly searchQuery = signal('');
  protected readonly selectedTag = signal<string | null>(null);
  protected readonly selectedGame = signal<(ContentRead & Partial<GamePlayable>) | null>(null);

  // Leaderboard state for the modal/card view
  protected readonly activeLeaderboardGame = signal<ContentRead | null>(null);
  protected readonly activeLeaderboard = signal<LeaderboardEntry[] | null>(null);
  protected readonly loadingLeaderboard = signal(false);

  protected readonly availableTags = computed(() => {
    const set = new Set<string>();
    for (const game of this.games()) {
      for (const tag of game.tags || []) {
        if (tag.trim()) set.add(tag.trim().toLowerCase());
      }
    }
    return Array.from(set).sort();
  });

  protected readonly filteredGames = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const tag = this.selectedTag()?.toLowerCase();

    return this.games().filter((game) => {
      const matchesSearch =
        !q ||
        game.title.toLowerCase().includes(q) ||
        (game.tags && game.tags.some((t) => t.toLowerCase().includes(q))) ||
        game.owner.toLowerCase().includes(q);

      const matchesTag = !tag || (game.tags && game.tags.map((t) => t.toLowerCase()).includes(tag));

      return matchesSearch && matchesTag;
    });
  });

  async ngOnInit(): Promise<void> {
    await this.loadGames();

    // Check if ?play=<id> is in the URL query params
    this.route.queryParamMap.subscribe((params) => {
      const playId = params.get('play');
      if (playId) {
        const found = this.games().find((g) => g.id === playId);
        if (found && this.selectedGame()?.id !== playId) {
          void this.selectGame(found);
        }
      } else {
        this.selectedGame.set(null);
      }
    });
  }

  async loadGames(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await firstValueFrom(this.api.listGames());
      this.games.set(list);

      // Pre-warm the first few games in background
      list.slice(0, 3).forEach((g) => this.prefetch.prefetch(g.id));

      // Check if URL specifies a game to play
      const playId = this.route.snapshot.queryParamMap.get('play');
      if (playId) {
        const found = list.find((g) => g.id === playId);
        if (found) {
          void this.selectGame(found);
        }
      }
    } catch {
      // Fallback: try listContent('game')
      try {
        const fallback = await firstValueFrom(this.api.listContent('game'));
        this.games.set(fallback);
        fallback.slice(0, 3).forEach((g) => this.prefetch.prefetch(g.id));
      } catch {
        this.error.set('Failed to load games. Please check your connection.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  onHoverGame(gameId: string): void {
    this.prefetch.prefetch(gameId);
  }

  async selectGame(game: ContentRead): Promise<void> {
    this.selectedGame.set(game);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { play: game.id },
      queryParamsHandling: 'merge',
    });
  }

  closeGame(): void {
    this.selectedGame.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { play: null },
      queryParamsHandling: 'merge',
    });
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  toggleTag(tag: string): void {
    if (this.selectedTag() === tag) {
      this.selectedTag.set(null);
    } else {
      this.selectedTag.set(tag);
    }
  }

  async openLeaderboard(game: ContentRead, event: Event): Promise<void> {
    event.stopPropagation();
    this.activeLeaderboardGame.set(game);
    this.loadingLeaderboard.set(true);
    try {
      const entries = await firstValueFrom(this.api.getLeaderboard(game.id, 10));
      this.activeLeaderboard.set(entries);
    } catch {
      this.activeLeaderboard.set([]);
    } finally {
      this.loadingLeaderboard.set(false);
    }
  }

  closeLeaderboard(): void {
    this.activeLeaderboardGame.set(null);
    this.activeLeaderboard.set(null);
  }

  getGameColor(title: string): string {
    const colors = [
      'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
      'linear-gradient(135deg, #ec4899 0%, #d946ef 100%)',
      'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
      'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
}
