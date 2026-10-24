import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideBrain,
  LucideGamepad2,
  LucideHouse,
  LucideSettings,
  LucideSkull,
  LucideVideo,
} from '@lucide/angular';
import { UserService } from './modules/user/service/user-service';
import { Header } from './shared/header/header';

@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LucideHouse,
    LucideGamepad2,
    LucideBrain,
    LucideVideo,
    LucideSkull,
    LucideSettings,
    Header,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly userService = inject(UserService);
  protected readonly isAuthenticated = this.userService.isAuthenticated;
}
