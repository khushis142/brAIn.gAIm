import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {LucideDynamicIcon, LucideHouse, LucideMoon, LucideSettings, LucideSun, LucideUpload} from '@lucide/angular';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LucideHouse, LucideUpload, LucideSettings, LucideDynamicIcon],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
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

  private applyTheme(): void {
    document.documentElement.classList.toggle('dark', this.isDarkMode());
  }

  protected icon() {
    return this.isDarkMode() ? LucideSun : LucideMoon;
  }
}
