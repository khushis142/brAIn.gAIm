/** The host's sound setting, applied inside the game iframe. */
export interface RuntimeSound {
  /** Applies the host's mute button and volume slider; an invalid volume counts as 1. */
  set(muted: boolean, volume: unknown): void;
}

/**
 * The host's mute button and volume slider. Media elements are muted and scaled as they
 * play, Web Audio through a gain node standing in for each context's destination. A game
 * that works around this only defeats its own player's setting; it is a courtesy, not a
 * security boundary.
 *
 * Part of the game runtime: serialized with toString() into the iframe script, so it
 * may use only type imports and browser globals (see gameRuntime.ts).
 */
export function createRuntimeSound(initialMuted: boolean, initialVolume: unknown): RuntimeSound {
  const toVolume = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;
  let muted = initialMuted;
  let volume = toVolume(initialVolume);
  const playingMedia = new Set<HTMLMediaElement>();
  const masterGains = new Set<GainNode>();
  const forgetMedia = (event: Event): void => {
    playingMedia.delete(event.target as HTMLMediaElement);
  };
  let applyMediaSound = (_media: HTMLMediaElement): void => {};
  const MediaElement = window.HTMLMediaElement;
  const mediaVolume = MediaElement &&
    Object.getOwnPropertyDescriptor(MediaElement.prototype, 'volume');
  if (MediaElement && mediaVolume?.get && mediaVolume.set) {
    const setRealVolume = mediaVolume.set;
    // What the game asked for; the element plays at that times the host's volume
    const gameVolumes = new WeakMap<HTMLMediaElement, number>();
    applyMediaSound = (media) => {
      media.muted = muted;
      setRealVolume.call(media, (gameVolumes.get(media) ?? 1) * volume);
    };
    Object.defineProperty(MediaElement.prototype, 'volume', {
      configurable: true,
      enumerable: mediaVolume.enumerable,
      get(this: HTMLMediaElement): number {
        return gameVolumes.get(this) ?? 1;
      },
      set(this: HTMLMediaElement, value: number) {
        setRealVolume.call(this, value); // throws on values the browser would reject
        gameVolumes.set(this, value);
        setRealVolume.call(this, value * volume);
      },
    });
    const play = MediaElement.prototype.play;
    MediaElement.prototype.play = function (this: HTMLMediaElement): Promise<void> {
      applyMediaSound(this);
      playingMedia.add(this);
      this.addEventListener('pause', forgetMedia); // also fires when playback ends
      return play.call(this);
    };
  }
  const gainLevel = (): number => (muted ? 0 : volume);
  const AudioContextBase = window.BaseAudioContext;
  const destination = AudioContextBase &&
    Object.getOwnPropertyDescriptor(AudioContextBase.prototype, 'destination');
  if (destination?.get) {
    const realDestination = destination.get;
    const OfflineContext = window.OfflineAudioContext;
    const gains = new WeakMap<BaseAudioContext, GainNode>();
    // No object spread here: it compiles to helpers outside this function
    Object.defineProperty(AudioContextBase.prototype, 'destination', {
      configurable: true,
      enumerable: destination.enumerable,
      get(this: BaseAudioContext): AudioNode {
        // Offline rendering produces buffers, not sound; muting it would make them silent
        if (OfflineContext && this instanceof OfflineContext) return realDestination.call(this);
        let gain = gains.get(this);
        if (!gain) {
          gain = this.createGain();
          gain.gain.value = gainLevel();
          gain.connect(realDestination.call(this));
          gains.set(this, gain);
          masterGains.add(gain);
        }
        return gain;
      },
    });
  }

  return {
    set(nextMuted: boolean, nextVolume: unknown): void {
      muted = nextMuted;
      volume = toVolume(nextVolume);
      for (const media of playingMedia) applyMediaSound(media);
      for (const gain of masterGains) gain.gain.value = gainLevel();
    },
  };
}
