import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserService } from '../service/user-service';

@Component({
  imports: [RouterLink, ReactiveFormsModule],
  selector: 'app-register',
  styleUrl: './register.css',
  templateUrl: './register.html',
})
export class Register {
  private readonly userService = inject(UserService);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly registerForm = this.formBuilder.group({
    username: this.formBuilder.control<string | null>(null, Validators.required),
    password: this.formBuilder.control<string | null>(null, Validators.required),
  });
  protected readonly error = signal('');
  protected readonly submitting = signal(false);

  protected submit(): void {
    this.error.set('');
    this.submitting.set(true);
    const { username, password } = this.registerForm.getRawValue();
    if (username === null || password === null) {
      return;
    }

    this.userService.register({ username, password }).subscribe({
      error: () => {
        this.error.set('Unable to create your account. Please try again.');
        this.submitting.set(false);
      },
    });
  }
}
