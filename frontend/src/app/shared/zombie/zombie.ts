import { booleanAttribute, Component, computed, effect, input, signal } from '@angular/core';
import { ZombieEquipped } from '../../core/api.service';
import {
  ACCESSORY_ART,
  avatarHref,
  DEFAULT_AVATAR,
  SLOT_ORDER,
  ZOMBIE_ANCHORS,
  ZOMBIE_VIEW_BOX,
  ZombieAnchor,
} from './zombie-art';

const CROSS_FADE_MS = 500; // keep in sync with the avatar-in animation in zombie.css

/** The mascot: an avatar wearing its equipped accessories */
@Component({
  selector: 'app-zombie',
  styleUrl: './zombie.css',
  templateUrl: './zombie.html',
  host: { 'aria-hidden': 'true', '[class.walk-in]': 'walkIn()' },
})
export class Zombie {
  /** Null while unknown; draws the default avatar */
  readonly avatar = input<string | null>(null);
  readonly equipped = input<ZombieEquipped | null>(null);
  /** Shamble in from the side instead of starting in place */
  readonly walkIn = input(false, { transform: booleanAttribute });

  /** Avatar being faded out underneath the new one */
  protected readonly previousAvatar = signal<string | null>(null);
  protected readonly viewBox = ZOMBIE_VIEW_BOX;
  protected readonly layers = computed(() => {
    const avatar = this.avatar() ?? DEFAULT_AVATAR;
    const previous = this.previousAvatar();
    return ZOMBIE_ANCHORS.map((anchor) => ({
      anchor,
      base: avatarHref(avatar, anchor),
      previousBase: previous === null ? null : avatarHref(previous, anchor),
      accessories: this.accessoryHrefs(anchor),
    }));
  });

  constructor() {
    let last: string | null = null;
    effect((onCleanup) => {
      const current = this.avatar();
      // Only fade between two known avatars, not when the first one loads
      if (last !== null && current !== null && current !== last) {
        this.previousAvatar.set(last);
        const timer = setTimeout(() => this.previousAvatar.set(null), CROSS_FADE_MS);
        onCleanup(() => clearTimeout(timer));
      }
      last = current;
    });
  }

  private accessoryHrefs(anchor: ZombieAnchor): string[] {
    const equipped = this.equipped();
    if (equipped === null) return [];
    return SLOT_ORDER.flatMap((slot) => {
      const id = equipped[slot];
      const parts = id === null ? [] : (ACCESSORY_ART[id]?.parts ?? []);
      return parts.filter((part) => part.anchor === anchor).map((part) => part.href);
    });
  }
}
