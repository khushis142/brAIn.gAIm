import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { GameCustomData } from '../engine/gameProtocol';

export interface UserCreate {
  username: string;
  password: string;
}

export interface UserRead {
  id: string;
  username: string;
  interests: string;
  active_project_id?: string | null;
}

export interface UserUpdate {
  interests?: string;
  active_project_id?: string | null;
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
  round_id: string;
  /** Generated input for this round; pass it to GameSession.start as `data` */
  data?: GameCustomData;
}

export type FeedItem = VideoItem | GameItem;

export interface ContentRead {
  id: string;
  kind: 'video' | 'game';
  title: string;
  tags: string[];
  owner: string;
  url: string;
  created_at: string;
}

export interface ContentCreate {
  id: string;
  filename: string;
  title: string;
  tags?: string[];
}

export interface ScoreCreate {
  score: number;
  /** Feed round this score belongs to; resubmitting the same round is a no-op */
  round_id?: string;
}

export interface ScoreRead {
  newly_unlocked: string[];
  games_completed: number;
}

export type ZombieSlot = 'head' | 'eyes' | 'neck' | 'feet';

export interface AccessoryRead {
  id: string;
  name: string;
  slot: ZombieSlot;
  unlock_description: string;
}

export type ZombieEquipped = Record<ZombieSlot, string | null>;

export interface ZombieProgress {
  id: string;
  current: number;
  target: number;
}

export interface ZombieRead {
  unlocked: string[];
  equipped: ZombieEquipped;
  games_completed: number;
  progress: ZombieProgress[];
}

export interface LeaderboardEntry {
  username: string;
  score: number;
}

export interface AttachmentRead {
  id: string;
  filename: string;
  url: string;
  created_at: string;
}

export interface ProjectRead {
  id: string;
  name: string;
  body: string;
  attachments: AttachmentRead[];
  created_at: string;
  updated_at: string;
}

export interface ProjectUpdate {
  name?: string;
  body?: string;
}

export interface CdnFile {
  id: string;
  filename: string;
  url: string;
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

  listContent(kind?: ContentRead['kind'], limit = 100): Observable<ContentRead[]> {
    let params = new HttpParams().set('limit', limit);
    if (kind) params = params.set('kind', kind);
    return this.http.get<ContentRead[]>(this.url('content'), { params });
  }

  createContent(content: ContentCreate): Observable<ContentRead> {
    return this.http.post<ContentRead>(this.url('content'), content, this.authOptions());
  }

  nextItem(): Observable<FeedItem> {
    return this.http.post<FeedItem>(this.url('feed/next'), null, this.authOptions());
  }

  submitScore(gameId: string, score: ScoreCreate): Observable<ScoreRead> {
    return this.http.post<ScoreRead>(
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

  listAccessories(): Observable<AccessoryRead[]> {
    return this.http.get<AccessoryRead[]>(this.url('zombie/accessories'), this.authOptions());
  }

  getMyZombie(): Observable<ZombieRead> {
    return this.http.get<ZombieRead>(this.url('users/me/zombie'), this.authOptions());
  }

  /** Omitted slots stay as they are; null takes the item off */
  updateEquipped(equipped: Partial<ZombieEquipped>): Observable<ZombieRead> {
    return this.http.put<ZombieRead>(
      this.url('users/me/zombie/equipped'),
      equipped,
      this.authOptions(),
    );
  }

  listProjects(): Observable<ProjectRead[]> {
    return this.http.get<ProjectRead[]>(this.url('projects'), this.authOptions());
  }

  createProject(name: string): Observable<ProjectRead> {
    return this.http.post<ProjectRead>(this.url('projects'), { name }, this.authOptions());
  }

  updateProject(id: string, project: ProjectUpdate): Observable<ProjectRead> {
    return this.http.patch<ProjectRead>(
      this.url(`projects/${encodeURIComponent(id)}`),
      project,
      this.authOptions(),
    );
  }

  deleteProject(id: string): Observable<void> {
    return this.http.delete<void>(
      this.url(`projects/${encodeURIComponent(id)}`),
      this.authOptions(),
    );
  }

  processProjectFlashcards(projectId: string): Observable<void> {
    return this.http.post<void>(
      this.url(`projects/${encodeURIComponent(projectId)}/flashcards`),
      null,
      this.authOptions(),
    );
  }

  addAttachment(projectId: string, file: CdnFile): Observable<AttachmentRead> {
    return this.http.post<AttachmentRead>(
      this.url(`projects/${encodeURIComponent(projectId)}/attachments`),
      { id: file.id, filename: file.filename },
      this.authOptions(),
    );
  }

  deleteAttachment(projectId: string, attachmentId: string): Observable<void> {
    return this.http.delete<void>(
      this.url(
        `projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}`,
      ),
      this.authOptions(),
    );
  }

  uploadToCdn(file: File): Observable<CdnFile> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<CdnFile>(`${environment.cdnBaseUrl}/api/v1/files`, body);
  }

  deleteFromCdn(id: string): Observable<void> {
    return this.http.delete<void>(
      `${environment.cdnBaseUrl}/api/v1/files/${encodeURIComponent(id)}`,
    );
  }

  health(): Observable<Record<string, string>> {
    return this.get<Record<string, string>>('health');
  }

  cdnHealth(): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${environment.cdnBaseUrl}/healthz`);
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
