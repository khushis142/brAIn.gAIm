import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { LucideSettings } from '@lucide/angular';
import { UserService } from '../user/service/user-service';

@Component({
  imports: [FormsModule, LucideSettings],
  selector: 'app-settings',
  styleUrl: './settings.css',
  templateUrl: './settings.html',
})
export class Settings {
  private readonly userService = inject(UserService);
  protected readonly isInterestDialogOpen = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected interest = '';

  protected logout(): void {
    this.userService.logout();
  }

  protected openInterestDialog(): void {
    this.error.set('');
    this.isInterestDialogOpen.set(true);
  }

  protected closeInterestDialog(): void {
    this.isInterestDialogOpen.set(false);
    this.interest = '';
  }

  protected submit(): void {
    const interest = this.interest.trim();
    if (!interest) {
      return;
    }

    this.error.set('');
    this.submitting.set(true);
    this.userService.updateInterest(interest).pipe(
      finalize(() => this.submitting.set(false)),
    ).subscribe({
      next: () => this.closeInterestDialog(),
      error: () => this.error.set('Unable to update your interests. Please try again.'),
    });
  }
}
