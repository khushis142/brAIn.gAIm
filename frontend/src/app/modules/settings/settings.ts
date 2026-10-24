import { Component, inject } from '@angular/core';
import { LucideSettings } from '@lucide/angular';
import { UserService } from '../user/service/user-service';

@Component({
  imports: [LucideSettings],
  selector: 'app-settings',
  styleUrl: './settings.css',
  templateUrl: './settings.html',
})
export class Settings {
  private readonly userService = inject(UserService);

  protected logout(): void {
    this.userService.logout();
  }
}
