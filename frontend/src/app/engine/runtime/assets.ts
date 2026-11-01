import type { GameAssetKind, GameAssetsApi } from '../gameProtocol';

/** The asset limits the runtime enforces; a subset of GAME_BUDGETS. */
export interface RuntimeAssetBudgets {
  readonly maxAssets: number;
  readonly maxAssetBytes: number;
}

/** The game's assets API, or why the manifest was rejected. */
export type RuntimeAssets = { readonly assets: GameAssetsApi } | { readonly error: string };

interface AssetEntry {
  readonly kind: GameAssetKind;
  readonly url: string;
  readonly maxBytes: number;
  readonly preload: boolean;
}

/**
 * Validates the asset manifest the host passed in and builds api.assets on it. Entries
 * that are invalid, or neither https: nor an inline data: image, are unavailable and
 * never fetched. Nothing is loaded yet; call preload() to start the manifest's preloads.
 *
 * Part of the game runtime: serialized with toString() into the iframe script, so it
 * may use only type imports and browser globals (see gameRuntime.ts).
 */
export function createRuntimeAssets(manifest: unknown, budgets: RuntimeAssetBudgets): RuntimeAssets {
  const ASSET_LIMITS: Readonly<Record<GameAssetKind, number>> = Object.freeze({
    image: 5 * 1024 * 1024,
    audio: 10 * 1024 * 1024,
    font: 2 * 1024 * 1024,
    model: 15 * 1024 * 1024,
  });

  const assetManifest = (manifest && typeof manifest === 'object' &&
    !Array.isArray(manifest) ? manifest : {}) as Record<string, unknown>;
  if (Object.keys(assetManifest).length > budgets.maxAssets) {
    return { error: 'Runtime: asset count exceeds the budget' };
  }
  const assetCache = new Map<string, unknown>();
  const assetPending = new Map<string, Promise<unknown>>();
  const assetProgress = { loaded: 0, total: 0, bytesLoaded: 0, bytesTotal: 0 };
  const assetEntries = new Map<string, AssetEntry>();

  let totalAssetBytes = 0;
  for (const [id, entry] of Object.entries(assetManifest)) {
    const definition = entry as { kind?: unknown; url?: unknown; maxBytes?: unknown; preload?: unknown } | null;
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(id) || definition === null ||
        typeof definition !== 'object' ||
        !['image', 'audio', 'font', 'model'].includes(definition.kind as string) ||
        typeof definition.url !== 'string') continue;
    const kind = definition.kind as GameAssetKind;
    try {
      const url = new URL(definition.url);
      const inlineImage = kind === 'image' && url.protocol === 'data:' &&
        /^data:image\/(svg\+xml|png|jpeg|webp|gif)[;,]/.test(definition.url);
      if (url.protocol !== 'https:' && !inlineImage) continue;
      const hardLimit = ASSET_LIMITS[kind];
      const maxBytes = Math.min(
        hardLimit,
        typeof definition.maxBytes === 'number' && Number.isFinite(definition.maxBytes) &&
          definition.maxBytes > 0
          ? definition.maxBytes : hardLimit,
      );
      totalAssetBytes += maxBytes;
      if (totalAssetBytes > budgets.maxAssetBytes) {
        return { error: 'Runtime: asset byte budget exceeded' };
      }
      assetEntries.set(id, Object.freeze({
        kind,
        url: url.href,
        maxBytes,
        preload: definition.preload === true,
      }));
    } catch (_) {
      // Invalid manifest entries are unavailable and never fetched.
    }
  }

  // Each load counts toward bytesTotal with maxBytes until Content-Length or the finished
  // body gives its real size, so bytesLoaded / bytesTotal reaches 1 when the loads are done.
  const trackAssetBytes = (estimate: number) => {
    let expected = estimate;
    let received = 0;
    assetProgress.total += 1;
    assetProgress.bytesTotal += expected;
    const expect = (bytes: number): void => {
      assetProgress.bytesTotal += bytes - expected;
      expected = bytes;
    };
    return {
      expect,
      receive: (bytes: number): void => {
        received += bytes;
        assetProgress.bytesLoaded += bytes;
        // Content-Length can undercount, e.g. for compressed responses
        if (received > expected) expect(received);
      },
      finish: (): void => expect(received),
      // A failed asset drops out of the byte counts instead of staying half loaded
      fail: (): void => {
        assetProgress.bytesLoaded -= received;
        received = 0;
        expect(0);
      },
    };
  };

  const materializeAsset = async (id: string, definition: AssetEntry, bytes: ArrayBuffer): Promise<unknown> => {
    const blob = new Blob([bytes]);
    if (definition.kind === 'model') return bytes;
    const objectUrl = URL.createObjectURL(blob);
    try {
      if (definition.kind === 'image') {
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        return image;
      }
      if (definition.kind === 'audio') {
        const audio = new Audio(objectUrl);
        audio.preload = 'auto';
        await new Promise((resolve, reject) => {
          audio.addEventListener('canplaythrough', resolve, { once: true });
          audio.addEventListener('error', reject, { once: true });
          audio.load();
        });
        return audio;
      }
      // Registered under the manifest id so games can write ctx.font = '24px "titleFont"'
      const font = new FontFace(id, bytes);
      await font.load();
      document.fonts.add(font);
      return true;
    } finally {
      if (definition.kind !== 'audio') URL.revokeObjectURL(objectUrl);
    }
  };

  const readLimitedBody = async (
    response: Response,
    maxBytes: number,
    onBytes: (bytes: number) => void,
  ): Promise<ArrayBuffer> => {
    const reader = response.body?.getReader();
    if (!reader) {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > maxBytes) throw new Error('asset is too large');
      onBytes(bytes.byteLength);
      return bytes;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error('asset is too large');
        }
        chunks.push(part.value);
        onBytes(part.value.byteLength);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  };

  const loadAsset = (id: string, expectedKind: GameAssetKind): Promise<unknown> => {
    if (typeof id !== 'string' || !assetEntries.has(id) || assetEntries.get(id)!.kind !== expectedKind) {
      return Promise.resolve(expectedKind === 'font' ? false : null);
    }
    if (assetCache.has(id)) return Promise.resolve(assetCache.get(id));
    if (assetPending.has(id)) return assetPending.get(id)!;
    const definition = assetEntries.get(id)!;
    if (definition.url.startsWith('data:')) {
      // Inline images need no network request (the iframe's CSP allows data: images).
      const inline = new Image();
      inline.src = definition.url;
      const decoded = inline.decode().then(() => inline as unknown, () => null).then((asset) => {
        assetCache.set(id, asset);
        assetPending.delete(id);
        return asset;
      });
      assetPending.set(id, decoded);
      return decoded;
    }
    const progress = trackAssetBytes(definition.maxBytes);
    const promise = fetch(definition.url, { credentials: 'omit' })
      .then((response) => {
        if (!response.ok) throw new Error('asset request failed');
        const declaredLength = Number(response.headers.get('content-length'));
        if (declaredLength > definition.maxBytes) throw new Error('asset is too large');
        if (declaredLength > 0) progress.expect(declaredLength);
        return readLimitedBody(response, definition.maxBytes, progress.receive);
      })
      .then((bytes) => {
        if (bytes.byteLength > definition.maxBytes) throw new Error('asset is too large');
        progress.finish();
        return materializeAsset(id, definition, bytes);
      })
      .catch(() => {
        progress.fail();
        return expectedKind === 'font' ? false : null;
      })
      .then((asset) => {
        assetCache.set(id, asset);
        assetProgress.loaded += 1;
        assetPending.delete(id);
        return asset;
      });
    assetPending.set(id, promise);
    return promise;
  };

  const assets: GameAssetsApi = Object.freeze({
    progress: Object.freeze({
      get loaded() { return assetProgress.loaded; },
      get total() { return assetProgress.total; },
      get bytesLoaded() { return assetProgress.bytesLoaded; },
      get bytesTotal() { return assetProgress.bytesTotal; },
    }),
    loadImage: (id: string) => loadAsset(id, 'image') as Promise<HTMLImageElement | null>,
    loadAudio: (id: string) => loadAsset(id, 'audio') as Promise<HTMLAudioElement | null>,
    loadFont: (id: string) => loadAsset(id, 'font') as Promise<boolean>,
    loadModel: (id: string) => loadAsset(id, 'model') as Promise<ArrayBuffer | null>,
    preload: async (ids?: readonly string[]) => {
      const requested = ids === undefined
        ? [...assetEntries].filter(([, definition]) => definition.preload).map(([id]) => id)
        : [...ids];
      await Promise.all(requested.map((id) => {
        const definition = assetEntries.get(id);
        return definition ? loadAsset(id, definition.kind) : Promise.resolve(null);
      }));
    },
  });

  return { assets };
}
