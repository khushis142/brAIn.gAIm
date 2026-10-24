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

  it('lists study fields', () => {
    api.listFields().subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/fields`);
    expect(request.request.method).toBe('GET');
    request.flush([{ slug: 'biology', name: 'Biology' }]);
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
    api.submitScore('game/id', { score: 42 }).subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/games/game%2Fid/scores`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.body).toEqual({ score: 42 });
    request.flush(null);
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

  function authenticate(): void {
    api.login('alex', 'password123').subscribe();
    httpTesting.expectOne(`${environment.apiBaseUrl}/auth/token`).flush({
      access_token: 'access-token',
      token_type: 'bearer',
    });
  }
});
