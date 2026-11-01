import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-health-badge',
  styleUrl: './health-badge.css',
  templateUrl: './health-badge.html',
})
export class HealthBadge implements OnDestroy, OnInit {
  private readonly api = inject(ApiService);
  readonly service = input<'Backend' | 'CDN'>('Backend');
  readonly icon = input('dns');
  protected readonly status = signal<'Checking' | 'Healthy' | 'Unavailable'>('Checking');
  protected readonly showStatusPopup = signal(false);
  protected readonly fadingStatusPopup = signal(false);

  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private popupTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    const health = this.service() === 'CDN' ? this.api.cdnHealth() : this.api.health();
    health.subscribe({
      next: () => this.status.set('Healthy'),
      error: () => this.status.set('Unavailable'),
    });
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  protected startHold(): void {
    this.clearTimers();
    this.holdTimer = setTimeout(() => {
      this.openStatusPopup();
    }, 500);
  }

  protected onClick(): void {
    this.cancelHold();
    this.openStatusPopup();
  }

  protected cancelHold(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  protected preventContextMenu(event: Event): void {
    event.preventDefault();
  }

  private clearTimers(): void {
    this.cancelHold();
    if (this.popupTimer) {
      clearTimeout(this.popupTimer);
      this.popupTimer = null;
    }
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private openStatusPopup(): void {
    if (this.popupTimer) {
      clearTimeout(this.popupTimer);
    }
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
    }
    this.showStatusPopup.set(true);
    this.fadingStatusPopup.set(false);
    this.popupTimer = setTimeout(() => {
      this.fadingStatusPopup.set(true);
      this.fadeTimer = setTimeout(() => this.showStatusPopup.set(false), 200);
    }, 3000);
  }
}
