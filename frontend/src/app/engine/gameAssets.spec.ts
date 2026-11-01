import { afterEach, describe, expect, it, vi } from 'vitest';
import { inlineGameAssets } from './gameAssets';

describe('inlineGameAssets', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(responses: Record<string, Response>) {
    const fetchMock = vi.fn(
      async (url: string) => responses[url] ?? new Response('', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('replaces the listed URLs with data: URLs and leaves the input untouched', async () => {
    stubFetch({
      'http://cdn.test/files/a/speech.wav': new Response('RIFF', {
        headers: { 'Content-Type': 'audio/wav' },
      }),
    });
    const data = {
      context: 'Otters',
      sentences: [{ text: 'Hi', audio: 'http://cdn.test/files/a/speech.wav' }],
    };

    const result = await inlineGameAssets(data, ['/sentences/0/audio']);

    expect(result['sentences']).toEqual([{ text: 'Hi', audio: 'data:audio/wav;base64,UklGRg==' }]);
    expect(data.sentences[0].audio).toBe('http://cdn.test/files/a/speech.wav');
  });

  it('removes assets that cannot be downloaded', async () => {
    stubFetch({});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = {
      context: 'x',
      sentences: [{ text: 'Hi', audio: 'http://cdn.test/missing.wav' }],
    };

    const result = await inlineGameAssets(data, ['/sentences/0/audio']);

    expect(result['sentences']).toEqual([{ text: 'Hi' }]);
  });

  it('ignores pointers that do not resolve and URLs that are not http(s)', async () => {
    const fetchMock = stubFetch({});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = { context: 'x', audio: 'javascript:alert(1)' };

    const result = await inlineGameAssets(data, ['/nope/0/audio', 'audio', '/context/x', '/audio']);

    expect(result).toEqual({ context: 'x' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the data as is when there are no assets', async () => {
    const data = { context: 'x' };
    expect(await inlineGameAssets(data, undefined)).toBe(data);
    expect(await inlineGameAssets(data, [])).toBe(data);
  });
});
