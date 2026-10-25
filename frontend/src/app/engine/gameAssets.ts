import { GameCustomData } from './gameProtocol';

/**
 * Replaces the media URLs a game round lists in `assets` (JSON Pointers into `data`, e.g.
 * TTS audio) with data: URLs. The sandboxed game iframe has no network access and cannot
 * read the host's blob: URLs, so it can only play media handed over inline. A URL that cannot
 * be downloaded is removed, so the game falls back to running without that media.
 */
export async function inlineGameAssets(
  data: GameCustomData,
  assets: readonly string[] | undefined,
): Promise<GameCustomData> {
  if (!assets?.length) return data;
  const copy = structuredClone(data) as GameCustomData;
  await Promise.all(
    assets.map(async (pointer) => {
      const target = resolvePointer(copy, pointer);
      if (!target) return;
      const { parent, key } = target;
      const url = parent[key];
      if (typeof url !== 'string') return;
      try {
        parent[key] = await toDataUrl(url);
      } catch (err) {
        console.warn(`Could not load game asset ${pointer}`, err);
        delete parent[key];
      }
    }),
  );
  return copy;
}

function resolvePointer(
  root: unknown,
  pointer: string,
): { parent: Record<string, unknown>; key: string } | null {
  if (!pointer.startsWith('/')) return null;
  const keys = pointer
    .slice(1)
    .split('/')
    .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  const key = keys.pop()!;
  let parent = root;
  for (const step of keys) {
    if (parent === null || typeof parent !== 'object' || !Object.hasOwn(parent, step)) return null;
    parent = (parent as Record<string, unknown>)[step];
  }
  if (parent === null || typeof parent !== 'object') return null;
  return { parent: parent as Record<string, unknown>, key };
}

async function toDataUrl(url: string): Promise<string> {
  const { protocol } = new URL(url);
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`Unsupported URL ${url}`);
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? 'application/octet-stream';
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}
