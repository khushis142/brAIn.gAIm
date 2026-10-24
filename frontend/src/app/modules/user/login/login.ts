import { Component, inject, signal } from '@angular/core';
import {FormBuilder, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserService } from '../service/user-service';

@Component({
  imports: [FormsModule, RouterLink, ReactiveFormsModule],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private readonly userService = inject(UserService);
  private fromBuilder = inject(FormBuilder);
  protected loginForm = this.fromBuilder.group({
    username: this.fromBuilder.control<string | null>(null, Validators.required),
    password: this.fromBuilder.control<string | null>(null, Validators.required),
  })
  protected readonly error = signal('');
  protected readonly submitting = signal(false);

  protected submit(): void {
    this.error.set('');
    this.submitting.set(true);
    const { username, password } = this.loginForm.getRawValue();
    if (username === null || password === null) {
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
