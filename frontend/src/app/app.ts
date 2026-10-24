import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {LucideDynamicIcon, LucideHouse, LucideSettings, LucideUpload, LucideSun, LucideMoon} from '@lucide/angular';
import { HealthBadge } from './shared/health-badge/health-badge';
import { UserService } from './modules/user/service/user-service';

@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LucideHouse,
    LucideUpload,
    LucideSettings,
    LucideDynamicIcon,
    HealthBadge,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly userService = inject(UserService);
  protected readonly title = signal('brAIn.gAIn');
  protected readonly isAuthenticated = this.userService.isAuthenticated;
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

  private applyTheme(): void {
    document.documentElement.classList.toggle('dark', this.isDarkMode());
  }

  protected icon() {
    return this.isDarkMode() ? LucideSun : LucideMoon;
  }
}
