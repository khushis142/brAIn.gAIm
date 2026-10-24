import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { GAME_RUNTIME_SOURCE } from './app/engine/gameRuntimeToken';

async function loadRuntimeSource(): Promise<string> {
  const res = await fetch('assets/game-runtime.js', { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Could not load game-runtime.js (${res.status})`);
  }
  const source = await res.text();

  // The runtime is inlined into a script tag, so this sequence would break the page
  if (/<\/script/i.test(source)) {
    throw new Error('game-runtime.js must not contain a closing script tag');
  }
  return source;
}

loadRuntimeSource()
  .then((runtimeSource) =>
    bootstrapApplication(App, {
      ...appConfig,
      providers: [
        ...(appConfig.providers ?? []),
        { provide: GAME_RUNTIME_SOURCE, useValue: runtimeSource },
      ],
    }),
  )
  .catch((err) => console.error(err));
