import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { ApiService } from './core/api.service';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        {
          provide: ApiService,
          useValue: { health: () => of({}), cdnHealth: () => of({}), isAuthenticated: () => true },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the application header', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand .logo-light')?.getAttribute('alt')).toBe('brAIn.gAIn');
    expect(compiled.querySelector('.brand .logo-dark')?.getAttribute('src')).toBe(
      '/assets/brAIngAIm_white.webp',
    );
  });

  it('shows healthy backend status in the header', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.health-badge')?.getAttribute('aria-label')).toBe(
      'Backend: Healthy',
    );
  });
});
