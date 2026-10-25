import { describe, expect, it } from 'vitest';
import { resolveAssetBaseUrl } from './gameRuntimeToken';

describe('resolveAssetBaseUrl', () => {
  it('resolves a relative CDN base against the document', () => {
    expect(resolveAssetBaseUrl('/cdn', 'https://app.example.test/home')).toBe('https://app.example.test/cdn/');
  });

  it('keeps an absolute CDN base and adds one trailing slash', () => {
    expect(resolveAssetBaseUrl('https://cdn.example.test:8444', 'https://app.example.test/'))
      .toBe('https://cdn.example.test:8444/');
    expect(resolveAssetBaseUrl('https://cdn.example.test/files//', 'https://app.example.test/'))
      .toBe('https://cdn.example.test/files/');
  });
});
