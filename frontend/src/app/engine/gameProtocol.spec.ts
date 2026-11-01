import { describe, expect, it } from 'vitest';
import { isGameUiDesign, isSandboxEvent } from './gameProtocol';
import type { GameApi, GameModule, GamePackageMetadata } from './gameProtocol';

describe('game protocol validation', () => {
  it('supports mobile package metadata', () => {
    const metadata: GamePackageMetadata = {
      renderer: '2d',
      orientation: 'portrait',
      minDurationSeconds: 20,
      maxDurationSeconds: 60,
      input: ['touch', 'keyboard'],
      assets: { player: { kind: 'image', url: 'https://cdn.example.test/player.png' } },
    };

    expect(metadata.maxDurationSeconds).toBeGreaterThanOrEqual(metadata.minDurationSeconds);
    expect(metadata.input).toContain('touch');
  });

  it('supports both renderer declarations in the game contract', () => {
    const webglGame: GameModule = {
      renderer: 'webgl',
      init(api: GameApi) {
        expect(api.renderer).toBe('webgl');
      },
      update() {},
      render() {},
    };
    const twoDGame: GameModule = {
      init(api: GameApi) {
        expect(api.renderer).toBe('2d');
      },
      update() {},
      render() {},
    };

    expect(webglGame.renderer).toBe('webgl');
    expect(twoDGame.renderer).toBeUndefined();
  });

  it('accepts a complete UI design with allowlisted theme tokens', () => {
    expect(
      isGameUiDesign({
        theme: { accent: 'amber', panel: 'dark', density: 'compact' },
        pauseMenu: { title: 'Pause', message: 'Take a break', resumeLabel: 'Resume' },
        leaderboard: { title: 'Results', subtitle: 'Good run', scoreLabel: 'Points' },
      }),
    ).toBe(true);
  });

  it('rejects unsafe or malformed UI designs', () => {
    expect(isGameUiDesign({ theme: { accent: '#ff0000' } })).toBe(false);
    expect(isGameUiDesign({ theme: { density: 'spacious' } })).toBe(false);
    expect(isGameUiDesign({ pauseMenu: { title: 42 } })).toBe(false);
    expect(isGameUiDesign({ leaderboard: [] })).toBe(false);
  });

  it('accepts finite-score result events and rejects invalid scores', () => {
    expect(isSandboxEvent({ type: 'result', result: { score: 12, level: 2 } })).toBe(true);
    expect(isSandboxEvent({ type: 'result', result: { score: Number.NaN } })).toBe(false);
    expect(isSandboxEvent({ type: 'result', result: { score: '12' } })).toBe(false);
  });

  it('rejects malformed sandbox events', () => {
    expect(isSandboxEvent({ type: 'ui-design', design: { pauseMenu: { title: 1 } } })).toBe(false);
    expect(isSandboxEvent({ type: 'error', message: 123 })).toBe(false);
    expect(isSandboxEvent(null)).toBe(false);
  });
});
