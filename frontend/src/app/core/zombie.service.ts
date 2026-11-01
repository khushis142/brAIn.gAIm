import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AccessoryRead,
  ApiService,
  AvatarRead,
  ZombieEquipped,
  ZombieRead,
  ZombieSlot,
} from './api.service';

const NOTHING_EQUIPPED: ZombieEquipped = { head: null, eyes: null, neck: null, feet: null };

/** The player's zombie mascot: unlocked accessories and what it is wearing */
@Injectable({ providedIn: 'root' })
export class ZombieService {
  private readonly api = inject(ApiService);
  private readonly _state = signal<ZombieRead | null>(null);
  private readonly _accessories = signal<AccessoryRead[]>([]);
  private readonly _avatars = signal<AvatarRead[]>([]);

  readonly state = this._state.asReadonly();
  readonly accessories = this._accessories.asReadonly();
  readonly avatars = this._avatars.asReadonly();
  readonly equipped = computed(() => this._state()?.equipped ?? NOTHING_EQUIPPED);
  /** Null until loaded, so the first avatar appears without a cross-fade */
  readonly avatar = computed(() => this._state()?.avatar ?? null);

  async load(): Promise<void> {
    const [state, accessories, avatars] = await Promise.all([
      firstValueFrom(this.api.getMyZombie()),
      firstValueFrom(this.api.listAccessories()),
      firstValueFrom(this.api.listAvatars()),
    ]);
    this._state.set(state);
    this._accessories.set(accessories);
    this._avatars.set(avatars);
  }

  async refresh(): Promise<void> {
    this._state.set(await firstValueFrom(this.api.getMyZombie()));
  }

  /** Puts `accessoryId` in `slot`, or takes the slot's item off when null */
  async equip(slot: ZombieSlot, accessoryId: string | null): Promise<void> {
    this._state.set(await firstValueFrom(this.api.updateEquipped({ [slot]: accessoryId })));
  }

  async selectAvatar(avatarId: string): Promise<void> {
    this._state.set(await firstValueFrom(this.api.updateAvatar(avatarId)));
  }

  accessoryName(id: string): string {
    return this._accessories().find((accessory) => accessory.id === id)?.name ?? id;
  }

  avatarName(id: string): string {
    return this._avatars().find((avatar) => avatar.id === id)?.name ?? id;
  }
}
