import { InjectionToken } from '@angular/core';
import { GAME_RUNTIME_SCRIPT } from './gameRuntime';

/** The runtime script injected into every game iframe; built from gameRuntime.ts. */
export const GAME_RUNTIME_SOURCE = new InjectionToken<string>('GAME_RUNTIME_SOURCE', {
  providedIn: 'root',
  factory: () => GAME_RUNTIME_SCRIPT,
});
