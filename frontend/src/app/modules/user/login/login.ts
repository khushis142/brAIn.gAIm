import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserService } from '../service/user-service';

@Component({
  imports: [RouterLink, ReactiveFormsModule],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private readonly userService = inject(UserService);
  private readonly formBuilder = inject(FormBuilder);
  protected loginForm = this.formBuilder.group({
    username: this.formBuilder.control<string | null>(null, Validators.required),
    password: this.formBuilder.control<string | null>(null, [
      Validators.required
    ]),
  });
  protected readonly error = signal('');
  protected readonly submitting = signal(false);

  protected submit(): void {
    this.error.set('');
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid) {
      return;
    }

    this.submitting.set(true);
    const { username, password } = this.loginForm.getRawValue();
    if (username === null || password === null) {
      this.submitting.set(false);
      return;
    }

    this.userService.login(username, password).subscribe({
      error: () => {
        this.error.set('Unable to log in. Check your username and password.');
        this.submitting.set(false);
      },
    });
  }
}
