import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UserCreate {
  username: string;
  password: string;
  field?: string;
}

export interface UserRead {
  id: string;
  username: string;
  field: string;
}

export interface UserUpdate {
  field: string;
}

export interface Token {
  access_token: string;
  token_type: 'bearer';
}

export interface StudyFieldRead {
  slug: string;
  name: string;
}

export interface VideoItem {
  type: 'video';
  id: string;
  title: string;
  url: string;
}

export interface GameItem {
  type: 'game';
  id: string;
  title: string;
  url: string;
}

export type FeedItem = VideoItem | GameItem;

export interface ScoreCreate {
  score: number;
}

export interface LeaderboardEntry {
  username: string;
  score: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private accessToken: string | null =
    typeof localStorage !== 'undefined' ? localStorage.getItem('braingain-token') : null;

  get<T>(endpoint: string): Observable<T> {
    return this.http.get<T>(this.url(endpoint));
  }

  register(user: UserCreate): Observable<UserRead> {
    return this.http.post<UserRead>(this.url('auth/register'), user);
  }

  login(username: string, password: string): Observable<Token> {
    this.accessToken = null;
    const body = new HttpParams()
      .set('grant_type', 'password')
      .set('username', username)
      .set('password', password)
      .set('scope', '');

    return this.http.post<Token>(this.url('auth/token'), body).pipe(
      tap(({ access_token }) => {
        this.accessToken = access_token;
        localStorage.setItem('braingain-token', access_token);
      }),
    );
  }

  logout(): void {
    this.accessToken = null;
    localStorage.removeItem('braingain-token');
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  getMe(): Observable<UserRead> {
    return this.http.get<UserRead>(this.url('users/me'), this.authOptions());
  }

  updateMe(user: UserUpdate): Observable<UserRead> {
    return this.http.patch<UserRead>(this.url('users/me'), user, this.authOptions());
  }

  listFields(): Observable<StudyFieldRead[]> {
    return this.http.get<StudyFieldRead[]>(this.url('fields'));
  }

  nextItem(): Observable<FeedItem> {
    return this.http.post<FeedItem>(this.url('feed/next'), null, this.authOptions());
  }

  submitScore(gameId: string, score: ScoreCreate): Observable<void> {
    return this.http.post<void>(
      this.url(`games/${encodeURIComponent(gameId)}/scores`),
      score,
      this.authOptions(),
    );
  }

  getLeaderboard(gameId: string, limit = 10): Observable<LeaderboardEntry[]> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<LeaderboardEntry[]>(
      this.url(`games/${encodeURIComponent(gameId)}/leaderboard`),
      { params },
    );
  }

  health(): Observable<Record<string, string>> {
    return this.get<Record<string, string>>('health');
  }

  private url(endpoint: string): string {
    return `${environment.apiBaseUrl}/${endpoint.replace(/^\//, '')}`;
  }

  private authOptions(): { headers: HttpHeaders } {
    const headers = this.accessToken
      ? new HttpHeaders({ Authorization: `Bearer ${this.accessToken}` })
      : new HttpHeaders();
    return { headers };
  }
}
