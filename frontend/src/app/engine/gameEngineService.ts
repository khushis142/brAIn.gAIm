import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { GAME_ASSET_CDN_URL, GAME_RUNTIME_SOURCE } from './gameRuntimeToken';
import { GameSession } from './gameSession';

/** Factory for sandboxed game sessions. Holds no per-game state. */
@Injectable({ providedIn: 'root' })
export class GameEngineService {
  private readonly doc = inject(DOCUMENT);
  private readonly runtimeSource = inject(GAME_RUNTIME_SOURCE);
  private readonly assetBaseUrl = inject(GAME_ASSET_CDN_URL);

  createSession(container: HTMLElement): GameSession {
    return new GameSession(this.doc, container, this.runtimeSource, this.assetBaseUrl);
  }
}