import { Injectable } from '@angular/core';
import { GameModule } from './gameProtocol';

/**
 * Loader for TRUSTED games only (your own files).
 * The code runs with full access to the page, so never use this for AI-generated
 * or user-supplied code. Use GameEngineService / GameSession for those.
 */
@Injectable({ providedIn: 'root' })
export class GameLoaderService {
  async loadFromFile(file: File): Promise<GameModule> {
    const code = await file.text();
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      const mod = await import(/* @vite-ignore */ url);
      return mod as GameModule;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}