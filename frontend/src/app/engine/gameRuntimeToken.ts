import { DOCUMENT } from '@angular/common';
import { InjectionToken, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { GAME_RUNTIME_SCRIPT } from './gameRuntimeScript';

/** The runtime script injected into every game iframe; built from gameRuntime.ts. */
export const GAME_RUNTIME_SOURCE = new InjectionToken<string>('GAME_RUNTIME_SOURCE', {
  providedIn: 'root',
  factory: () => GAME_RUNTIME_SCRIPT,
});

/** Absolute CDN base URL (ending in '/') that game iframes may load assets from. */
export const GAME_ASSET_CDN_URL = new InjectionToken<string>('GAME_ASSET_CDN_URL', {
  providedIn: 'root',
  factory: () => resolveAssetBaseUrl(environment.cdnBaseUrl, inject(DOCUMENT).baseURI),
});

/**
 * Makes a possibly relative CDN base (e.g. '/cdn') absolute. The game iframe has an opaque
 * origin, so its CSP cannot use 'self' or relative sources. The trailing slash keeps the CSP
 * source a path prefix instead of an exact file.
 */
export function resolveAssetBaseUrl(cdnBaseUrl: string, documentBaseUrl: string): string {
  return new URL(cdnBaseUrl.replace(/\/*$/, '/'), documentBaseUrl).href;
}
