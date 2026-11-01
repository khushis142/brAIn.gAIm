import { GAME_BUDGETS, GAME_KEYS, GAME_PROTOCOL_VERSION } from './gameProtocol';
import { GameRuntimeConfig, GameRuntimeParts, gameRuntime } from './gameRuntime';
import { createRuntimeAssets } from './runtime/assets';
import { createRuntimeKeys } from './runtime/keys';
import { createRuntimeSound } from './runtime/sound';
import { createRuntimeTouch } from './runtime/touch';
import { createRuntimeViewport } from './runtime/viewport';
import { createRuntimeWebgl } from './runtime/webgl';

const config = {
  protocolVersion: GAME_PROTOCOL_VERSION,
  budgets: GAME_BUDGETS,
  gameKeys: GAME_KEYS,
} satisfies GameRuntimeConfig;

const parts = {
  createSound: createRuntimeSound,
  createAssets: createRuntimeAssets,
  createViewport: createRuntimeViewport,
  createWebgl: createRuntimeWebgl,
  createKeys: createRuntimeKeys,
  createTouch: createRuntimeTouch,
} satisfies GameRuntimeParts;

// Parameter names inside gameRuntime survive minification consistently, imported names
// do not, so the parts are passed in as an argument instead of being referenced.
const partsSource = Object.entries(parts)
  .map(([name, part]) => `  ${name}: ${part.toString()}`)
  .join(',\n');

/**
 * The runtime as inline script source, with the shared protocol values baked in.
 * The host puts it into the game iframe ahead of the game's own script.
 */
export const GAME_RUNTIME_SCRIPT =
  `(${gameRuntime.toString()})(${JSON.stringify(config)}, {\n${partsSource}\n});`;
