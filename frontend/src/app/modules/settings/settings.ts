import { Component, inject, OnInit, signal } from '@angular/core';
import { LucideSettings } from '@lucide/angular';
import { InterestsDialog } from '../user/interestsDialog/interests-dialog';
import { UserService } from '../user/service/user-service';

@Component({
  imports: [InterestsDialog, LucideSettings],
  selector: 'app-settings',
  styleUrl: './settings.css',
  templateUrl: './settings.html',
})
export class Settings implements OnInit {
  protected readonly userService = inject(UserService);
  protected readonly isInterestDialogOpen = signal(false);

  ngOnInit(): void {
    if (!this.userService.user()) {
      this.userService.loadUser().subscribe();
    }
  }

  protected logout(): void {
    this.userService.logout();
  }

  protected openInterestDialog(): void {
    this.isInterestDialogOpen.set(true);
  }

  protected closeInterestDialog(): void {
    this.isInterestDialogOpen.set(false);
  }
}
