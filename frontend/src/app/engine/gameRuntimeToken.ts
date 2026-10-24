import { InjectionToken } from '@angular/core';
 
/** The source code of game-runtime.js, fetched once before the app boots (see main.ts). */
export const GAME_RUNTIME_SOURCE = new InjectionToken<string>('GAME_RUNTIME_SOURCE');