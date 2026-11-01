import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService, GameItem } from './api.service';

/**
 * In-memory prefetch cache for game AI rounds.
 * Allows pre-warming AI rounds on hover, catalog load, or during active play
 * so games start and restart with zero latency.
 */
@Injectable({ providedIn: 'root' })
export class GamePrefetchService {
  private readonly api = inject(ApiService);
  private readonly cache = new Map<string, Promise<GameItem>>();

  prefetch(gameId: string): void {
    if (!gameId || this.cache.has(gameId)) return;
    const promise = firstValueFrom(this.api.playGame(gameId)).catch((err) => {
      this.cache.delete(gameId);
      throw err;
    });
    this.cache.set(gameId, promise);
  }

  async consume(gameId: string): Promise<GameItem | null> {
    const existing = this.cache.get(gameId);
    if (!existing) return null;
    this.cache.delete(gameId);
    try {
      return await existing;
    } catch {
      return null;
    }
  }

  has(gameId: string): boolean {
    return this.cache.has(gameId);
  }

  clear(): void {
    this.cache.clear();
  }
}
