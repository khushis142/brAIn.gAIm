import { provideHttpClient } from '@angular/common/http';
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

  it('calls endpoints through the configured API base URL', () => {
    api.get<void>('health').subscribe();

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/health`);
    expect(request.request.method).toBe('GET');
    request.flush(null);
  });
});
