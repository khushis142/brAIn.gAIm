import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { HealthBadge } from './health-badge';

describe('HealthBadge', () => {
  let fixture: ComponentFixture<HealthBadge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HealthBadge],
      providers: [
        {
          provide: ApiService,
          useValue: { get: () => of(null) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HealthBadge);
    await fixture.whenStable();
  });

  it('shows the server icon with an accessible healthy backend status', () => {
    const badge = fixture.nativeElement as HTMLElement;
    expect(badge.querySelector('.material-symbols-outlined')?.textContent).toBe('dns');
    expect(badge.querySelector('.health-badge')?.getAttribute('aria-label')).toBe('Backend: Healthy');
  });
});
