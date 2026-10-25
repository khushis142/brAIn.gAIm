import type { GameSafeAreaInsets, GameViewport } from '../gameProtocol';

/** The canvas limits the viewport respects. */
export interface RuntimeViewportLimits {
  readonly maxCanvasDimension: number;
  readonly maxCanvasPixels: number;
  /** The game's requested cap on devicePixelRatio. */
  readonly maxPixelRatio: number;
}

/** Sizes the canvas and tracks the game's current viewport. */
export interface RuntimeViewport {
  /** The viewport the canvas has now; null until the first apply(). */
  readonly current: GameViewport | null;
  /**
   * Resizes the canvas to width x height logical pixels, scaled by the device pixel
   * ratio times qualityScale. Returns the new viewport, or null when the size is
   * invalid or nothing changed.
   */
  apply(width: number, height: number, qualityScale: number): GameViewport | null;
}

/**
 * Part of the game runtime: serialized with toString() into the iframe script, so it
 * may use only type imports and browser globals (see gameRuntime.ts).
 */
export function createRuntimeViewport(canvas: HTMLCanvasElement, limits: RuntimeViewportLimits): RuntimeViewport {
  let current: GameViewport | null = null;

  function readSafeArea(): GameSafeAreaInsets {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const inset = {
      top: Number.parseFloat(style.paddingTop) || 0,
      right: Number.parseFloat(style.paddingRight) || 0,
      bottom: Number.parseFloat(style.paddingBottom) || 0,
      left: Number.parseFloat(style.paddingLeft) || 0,
    };
    probe.remove();
    return inset;
  }

  function createViewport(width: number, height: number, qualityScale: number): GameViewport {
    const devicePixelRatio = Math.min(
      Math.max(window.devicePixelRatio || 1, 1),
      limits.maxPixelRatio,
    ) * qualityScale;
    const pixelWidth = Math.max(1, Math.min(limits.maxCanvasDimension,
      Math.round(width * devicePixelRatio)));
    const pixelHeight = Math.max(1, Math.min(limits.maxCanvasDimension,
      Math.round(height * devicePixelRatio)));
    if (pixelWidth * pixelHeight > limits.maxCanvasPixels) {
      throw new Error('Canvas backing store exceeds the memory budget');
    }
    return Object.freeze({
      width,
      height,
      pixelWidth,
      pixelHeight,
      devicePixelRatio,
      orientation: width >= height ? 'landscape' : 'portrait',
      safeArea: Object.freeze(readSafeArea()),
    });
  }

  return {
    get current() { return current; },
    apply(width: number, height: number, qualityScale: number): GameViewport | null {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
      const next = createViewport(Math.floor(width), Math.floor(height), qualityScale);
      if (current && next.width === current.width && next.height === current.height &&
          next.pixelWidth === current.pixelWidth && next.pixelHeight === current.pixelHeight &&
          JSON.stringify(next.safeArea) === JSON.stringify(current.safeArea)) return null;
      current = next;
      canvas.style.width = `${next.width}px`;
      canvas.style.height = `${next.height}px`;
      canvas.width = next.pixelWidth;
      canvas.height = next.pixelHeight;
      return next;
    },
  };
}
