import { booleanAttribute, Component, computed, input } from '@angular/core';
import { ZombieEquipped } from '../../core/api.service';
import {
  ACCESSORY_ART,
  SLOT_ORDER,
  ZOMBIE_ANCHORS,
  ZOMBIE_VIEW_BOX,
  ZombieAnchor,
  zombieHref,
} from './zombie-art';

/** The zombie mascot wearing its equipped accessories */
@Component({
  selector: 'app-zombie',
  styleUrl: './zombie.css',
  templateUrl: './zombie.html',
  host: { 'aria-hidden': 'true', '[class.walk-in]': 'walkIn()' },
})
export class Zombie {
  readonly equipped = input<ZombieEquipped | null>(null);
  /** Shamble in from the side instead of starting in place */
  readonly walkIn = input(false, { transform: booleanAttribute });

  protected readonly viewBox = ZOMBIE_VIEW_BOX;
  protected readonly layers = computed(() =>
    ZOMBIE_ANCHORS.map((anchor) => ({
      anchor,
      hrefs: [zombieHref(anchor), ...this.accessoryHrefs(anchor)],
    })),
  );

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
