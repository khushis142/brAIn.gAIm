import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { LucideLock, LucideSkull } from '@lucide/angular';
import { AccessoryRead, AvatarRead, ZombieProgress } from '../../core/api.service';
import { ZombieService } from '../../core/zombie.service';
import {
  ACCESSORY_ART,
  AccessoryArt,
  AVATAR_THUMB_VIEW_BOX,
  avatarHref,
} from '../../shared/zombie/zombie-art';
import { Zombie } from '../../shared/zombie/zombie';

interface WardrobeItem extends AccessoryRead {
  art: AccessoryArt | null;
  unlocked: boolean;
  equipped: boolean;
  progress: ZombieProgress | null;
}

interface AvatarChoice extends AvatarRead {
  thumbHref: string;
  unlocked: boolean;
  selected: boolean;
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
  /** Id of the avatar or accessory being saved; other taps wait for it */
  protected readonly saving = signal<string | null>(null);
  protected readonly avatarThumbViewBox = AVATAR_THUMB_VIEW_BOX;

  protected readonly avatars = computed<AvatarChoice[]>(() => {
    const state = this.zombie.state();
    return this.zombie.avatars().map((avatar) => ({
      ...avatar,
      thumbHref: avatarHref(avatar.id, 'head'),
      unlocked: state?.unlocked_avatars.includes(avatar.id) ?? false,
      selected: state?.avatar === avatar.id,
      progress: state?.avatar_progress.find((progress) => progress.id === avatar.id) ?? null,
    }));
  });

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

  protected choose(avatar: AvatarChoice): void {
    if (!avatar.unlocked || avatar.selected) return;
    void this.save(avatar.id, () => this.zombie.selectAvatar(avatar.id));
  }

  protected toggle(item: WardrobeItem): void {
    if (!item.unlocked) return;
    void this.save(item.id, () => this.zombie.equip(item.slot, item.equipped ? null : item.id));
  }

  private async save(id: string, change: () => Promise<void>): Promise<void> {
    if (this.saving() !== null) return;
    this.saving.set(id);
    this.error.set(null);
    try {
      await change();
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
    if (err.status === 401) return 'Please log in to see your avatar.';
    if (err.status === 403) return 'You have not unlocked that yet.';
    if (err.status === 422) return 'That choice is not available.';
    return `Server error (${err.status}).`;
  }
  return err instanceof Error ? err.message : String(err);
}
