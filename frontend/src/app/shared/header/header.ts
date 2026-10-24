import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideDynamicIcon,
  LucideMoon,
  LucideSun,
} from '@lucide/angular';
import { HealthBadge } from '../health-badge/health-badge';

@Component({
  imports: [RouterLink, LucideDynamicIcon, HealthBadge],
  selector: 'app-header',
  styleUrl: './header.css',
  templateUrl: './header.html',
})
export class Header {
  protected readonly title = signal('brAIn.gAIn');
  protected readonly isDarkMode = signal(false);

  constructor() {
    this.isDarkMode.set(
      typeof localStorage !== 'undefined' && localStorage.getItem('braingain-theme') === 'dark',
    );
    this.applyTheme();
  }

  protected toggleTheme(): void {
    this.isDarkMode.update((isDark) => !isDark);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('braingain-theme', this.isDarkMode() ? 'dark' : 'light');
    }
    this.applyTheme();
  }

  protected icon() {
    return this.isDarkMode() ? LucideSun : LucideMoon;
  }

  private applyTheme(): void {
    document.documentElement.classList.toggle('dark', this.isDarkMode());
  }
}
