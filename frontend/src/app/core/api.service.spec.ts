import { HttpParams, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    api = TestBed.inject(ApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('registers users with the JSON API', () => {
    api.register({ username: 'alex', password: 'password123' }).subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/auth/register`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      username: 'alex',
      password: 'password123',
    });
    request.flush({ id: 'user-id', username: 'alex', interests: 'biology' });
  });

  it('logs in with form-encoded credentials and uses the returned bearer token', () => {
    api.login('alex', 'password123').subscribe();

    const loginRequest = httpTesting.expectOne(`${environment.apiBaseUrl}/auth/token`);
    expect(loginRequest.request.method).toBe('POST');
    expect(loginRequest.request.body).toBeInstanceOf(HttpParams);
    expect(loginRequest.request.body.toString()).toBe(
      'grant_type=password&username=alex&password=password123&scope=',
    );
    loginRequest.flush({ access_token: 'access-token', token_type: 'bearer' });

    api.getMe().subscribe();
    const meRequest = httpTesting.expectOne(`${environment.apiBaseUrl}/users/me`);
    expect(meRequest.request.method).toBe('GET');
    expect(meRequest.request.headers.get('Authorization')).toBe('Bearer access-token');
    meRequest.flush({ id: 'user-id', username: 'alex', interests: 'biology' });
  });

  it('updates the authenticated user', () => {
    authenticate();
    api.updateMe({ interests: 'physics' }).subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/users/me`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.body).toEqual({ interests: 'physics' });
    request.flush({ id: 'user-id', username: 'alex', interests: 'physics' });
  });

  it('updates the active project on the authenticated user', () => {
    authenticate();
    api.updateMe({ active_project_id: 'project-id' }).subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/users/me`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ active_project_id: 'project-id' });
    request.flush({
      id: 'user-id',
      username: 'alex',
      interests: 'biology',
      active_project_id: 'project-id',
    });
  });

  it('requests flashcard processing for a project', () => {
    authenticate();
    api.processProjectFlashcards('project/id').subscribe();

    const request = httpTesting.expectOne(
      `${environment.apiBaseUrl}/projects/project%2Fid/flashcards`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.body).toBeNull();
    request.flush([
      {
        id: 'card-1',
        title: 'Was ist Wissen?',
        body: 'Lernen.',
        created_at: '2026-10-24T22:16:27.214712Z',
      },
    ]);
  });

  it('loads flashcards for a project', () => {
    authenticate();
    api.getProjectFlashcards('project/id').subscribe();

    const request = httpTesting.expectOne(
      `${environment.apiBaseUrl}/projects/project%2Fid/flashcards`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    request.flush([
      {
        id: 'card-1',
        title: 'Was ist Wissen?',
        body: 'Lernen.',
        created_at: '2026-10-24T22:16:27.214712Z',
      },
    ]);
  });

  it('updates a project folder color', () => {
    authenticate();
    api.updateProject('project/id', { color: '#42a5f5' }).subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/projects/project%2Fid`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ color: '#42a5f5' });
    request.flush({
      id: 'project-id',
      name: 'Mathe',
      color: '#42a5f5',
      body: '',
      attachments: [],
      created_at: '',
      updated_at: '',
    });
  });

  it('lists study fields', () => {
    api.listFields().subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/fields`);
    expect(request.request.method).toBe('GET');
    request.flush([{ slug: 'biology', name: 'Biology' }]);
  });

  it('lists games', () => {
    api.listGames(50).subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/games?limit=50`);
    expect(request.request.method).toBe('GET');
    request.flush([
      {
        id: 'game-1',
        kind: 'game',
        title: 'Quiz',
        tags: ['bio'],
        owner: 'alex',
        url: 'http://cdn/quiz.js',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('gets a single game', () => {
    api.getGame('game-1').subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/games/game-1`);
    expect(request.request.method).toBe('GET');
    request.flush({
      id: 'game-1',
      kind: 'game',
      title: 'Quiz',
      tags: ['bio'],
      owner: 'alex',
      url: 'http://cdn/quiz.js',
      created_at: '2026-01-01T00:00:00Z',
    });
  });

  it('requests to play a game round', () => {
    authenticate();
    api.playGame('game-1').subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/games/game-1/play`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    request.flush({
      type: 'game',
      id: 'game-1',
      title: 'Quiz',
      url: 'http://cdn/quiz.js',
      round_id: 'r-1',
      data: { context: 'Test' },
      assets: [],
    });
  });

  it('requests the next authenticated feed item', () => {
    authenticate();
    api.nextItem().subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/feed/next`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.body).toBeNull();
    request.flush({ type: 'video', id: 'video-id', title: 'Biology', url: 'https://example.test' });
  });

  it('submits scores for a game', () => {
    authenticate();
    let response: unknown;
    api.submitScore('game/id', { score: 42, round_id: 'round-1' }).subscribe((r) => (response = r));

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/games/game%2Fid/scores`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.body).toEqual({ score: 42, round_id: 'round-1' });
    request.flush({ newly_unlocked: ['hat'], games_completed: 1 });
    expect(response).toEqual({ newly_unlocked: ['hat'], games_completed: 1 });
  });

  it('loads the accessory catalog and the current zombie', () => {
    authenticate();
    api.listAccessories().subscribe();
    api.getMyZombie().subscribe();

    const catalog = httpTesting.expectOne(`${environment.apiBaseUrl}/zombie/accessories`);
    expect(catalog.request.headers.get('Authorization')).toBe('Bearer access-token');
    catalog.flush([]);
    const zombie = httpTesting.expectOne(`${environment.apiBaseUrl}/users/me/zombie`);
    expect(zombie.request.method).toBe('GET');
    zombie.flush({ unlocked: [], equipped: {}, games_completed: 0, progress: [] });
  });

  it('updates only the given zombie slots', () => {
    authenticate();
    api.updateEquipped({ head: 'hat', feet: null }).subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/users/me/zombie/equipped`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ head: 'hat', feet: null });
    request.flush({ unlocked: ['hat'], equipped: {}, games_completed: 1, progress: [] });
  });

  it('loads a game leaderboard with a limit', () => {
    api.getLeaderboard('game/id', 20).subscribe();

    const request = httpTesting.expectOne(
      `${environment.apiBaseUrl}/games/game%2Fid/leaderboard?limit=20`,
    );
    expect(request.request.method).toBe('GET');
    request.flush([{ username: 'alex', score: 42 }]);
  });

  it('checks API health through the configured base URL', () => {
    api.health().subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/health`);
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'ok' });
  });

  it('registers a video from an already-uploaded CDN file', () => {
    authenticate();
    api.createContent({ id: 'cdn-1', filename: 'clip.mp4', title: 'My clip', tags: ['bio'] }).subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/content`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.body).toEqual({
      id: 'cdn-1',
      filename: 'clip.mp4',
      title: 'My clip',
      tags: ['bio'],
    });
    request.flush({
      id: 'content-1',
      kind: 'video',
      title: 'My clip',
      tags: ['bio'],
      owner: 'alex',
      url: 'http://cdn/clip.mp4',
      created_at: '2026-01-01T00:00:00Z',
    });
  });

  function authenticate(): void {
    api.login('alex', 'password123').subscribe();
    httpTesting.expectOne(`${environment.apiBaseUrl}/auth/token`).flush({
      access_token: 'access-token',
      token_type: 'bearer',
    });
  }
});
