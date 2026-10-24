import { Component, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-health-badge',
  styleUrl: './health-badge.css',
  templateUrl: './health-badge.html',
})
export class HealthBadge implements OnInit {
  protected readonly status = signal<'Checking' | 'Healthy' | 'Unavailable'>('Checking');

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    this.api.get<unknown>('health').subscribe({
      next: () => this.status.set('Healthy'),
      error: () => this.status.set('Unavailable'),
    });
  }
}
