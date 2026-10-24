import { Component, EventEmitter, inject, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { UserService } from '../service/user-service';

@Component({
  imports: [FormsModule],
  selector: 'app-interests-dialog',
  styleUrl: './interests-dialog.css',
  templateUrl: './interests-dialog.html',
})
export class InterestsDialog {
  private readonly userService = inject(UserService);
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly saved = new EventEmitter<void>();

  protected interest = '';
  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  protected close(): void {
    this.closed.emit();
  }

  protected submit(): void {
    const interest = this.interest.trim();
    if (!interest || this.submitting()) {
      return;
    }

    this.error.set('');
    this.submitting.set(true);
    this.userService.updateInterest(interest).pipe(
      finalize(() => this.submitting.set(false)),
    ).subscribe({
      next: () => this.saved.emit(),
      error: () => this.error.set('Unable to update your interests. Please try again.'),
    });
  }
}
