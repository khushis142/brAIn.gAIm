import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { LucideLock, LucideSkull } from '@lucide/angular';
import { AccessoryRead, ZombieProgress } from '../../core/api.service';
import { ZombieService } from '../../core/zombie.service';
import { ACCESSORY_ART, AccessoryArt } from '../../shared/zombie/zombie-art';
import { Zombie } from '../../shared/zombie/zombie';

interface WardrobeItem extends AccessoryRead {
  art: AccessoryArt | null;
  unlocked: boolean;
  equipped: boolean;
  progress: ZombieProgress | null;
}

@Component({
  imports: [LucideLock, LucideSkull, Zombie],
  selector: 'app-wardrobe',
  styleUrl: './wardrobe.css',
  templateUrl: './wardrobe.html',
})
export class Wardrobe {
  protected readonly zombie = inject(ZombieService);
  protected readonly error = signal<string | null>(null);
  /** Id of the accessory being saved; other taps wait for it */
  protected readonly saving = signal<string | null>(null);

  protected readonly items = computed<WardrobeItem[]>(() => {
    const state = this.zombie.state();
    return this.zombie.accessories().map((accessory) => ({
      ...accessory,
      art: ACCESSORY_ART[accessory.id] ?? null,
      unlocked: state?.unlocked.includes(accessory.id) ?? false,
      equipped: state?.equipped[accessory.slot] === accessory.id,
      progress: state?.progress.find((progress) => progress.id === accessory.id) ?? null,
    }));
  });

  constructor() {
    this.zombie.load().catch((err) => this.error.set(describeError(err)));
  }

  protected async toggle(item: WardrobeItem): Promise<void> {
    if (!item.unlocked || this.saving() !== null) return;
    this.saving.set(item.id);
    this.error.set(null);
    try {
      await this.zombie.equip(item.slot, item.equipped ? null : item.id);
    } catch (err) {
      this.error.set(describeError(err));
      // Our copy of the wardrobe was out of date; show what the server has
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.zombie.refresh().catch(() => {});
      }
    } finally {
      this.saving.set(null);
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server.';
    if (err.status === 401) return 'Please log in to see your zombie.';
    if (err.status === 403) return 'You have not unlocked that item yet.';
    if (err.status === 422) return 'That item cannot be worn there.';
    return `Server error (${err.status}).`;
  }
  return err instanceof Error ? err.message : String(err);
}
