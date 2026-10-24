import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, switchMap, tap } from 'rxjs';
import { ApiService, Token, UserCreate, UserRead } from '../../../core/api.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly user = signal<UserRead | null>(null);
  readonly isAuthenticated = signal(this.api.isAuthenticated());

  login(username: string, password: string): Observable<Token> {
    return this.api.login(username, password).pipe(
      tap(() => {
        this.isAuthenticated.set(true);
        void this.router.navigateByUrl('/');
      }),
    );
  }

  register(details: UserCreate): Observable<Token> {
    return this.api.register(details).pipe(switchMap(() => this.login(details.username, details.password)));
  }

  loadUser(): Observable<UserRead> {
    return this.api.getMe().pipe(
      tap((user) => this.user.set(user)),
    );
  }

  updateInterest(interest: string): Observable<UserRead> {
    return this.api.updateMe({ field: interest }).pipe(
      tap((user) => this.user.set(user)),
    );
  }

  logout(): void {
    this.api.logout();
    this.user.set(null);
    this.isAuthenticated.set(false);
    void this.router.navigateByUrl('/login');
  }
}
