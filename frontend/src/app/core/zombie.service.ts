import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AccessoryRead, ApiService, ZombieEquipped, ZombieRead, ZombieSlot } from './api.service';

const NOTHING_EQUIPPED: ZombieEquipped = { head: null, eyes: null, neck: null, feet: null };

/** The player's zombie mascot: unlocked accessories and what it is wearing */
@Injectable({ providedIn: 'root' })
export class ZombieService {
  private readonly api = inject(ApiService);
  private readonly _state = signal<ZombieRead | null>(null);
  private readonly _accessories = signal<AccessoryRead[]>([]);

  readonly state = this._state.asReadonly();
  readonly accessories = this._accessories.asReadonly();
  readonly equipped = computed(() => this._state()?.equipped ?? NOTHING_EQUIPPED);

  async load(): Promise<void> {
    const [state, accessories] = await Promise.all([
      firstValueFrom(this.api.getMyZombie()),
      firstValueFrom(this.api.listAccessories()),
    ]);
    this._state.set(state);
    this._accessories.set(accessories);
  }

  async refresh(): Promise<void> {
    this._state.set(await firstValueFrom(this.api.getMyZombie()));
  }

  /** Puts `accessoryId` in `slot`, or takes the slot's item off when null */
  async equip(slot: ZombieSlot, accessoryId: string | null): Promise<void> {
    this._state.set(await firstValueFrom(this.api.updateEquipped({ [slot]: accessoryId })));
  }

  accessoryName(id: string): string {
    return this._accessories().find((accessory) => accessory.id === id)?.name ?? id;
  }
}
