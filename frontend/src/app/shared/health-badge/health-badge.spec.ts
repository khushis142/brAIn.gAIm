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
          useValue: {
            health: () => of(null),
            cdnHealth: () => of(null),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HealthBadge);
    await fixture.whenStable();
  });

  it('shows the server icon with an accessible healthy backend status', () => {
    const badge = fixture.nativeElement as HTMLElement;
    expect(badge.querySelector('.material-symbols-outlined')?.textContent).toBe('dns');
    expect(badge.querySelector('.health-badge')?.getAttribute('aria-label')).toBe(
      'Backend: Healthy',
    );
  });

  it('shows the video file icon and checks CDN status when configured for CDN', async () => {
    const cdnFixture = TestBed.createComponent(HealthBadge);
    cdnFixture.componentRef.setInput('service', 'CDN');
    cdnFixture.componentRef.setInput('icon', 'video_file');
    await cdnFixture.whenStable();

    const badge = cdnFixture.nativeElement as HTMLElement;
    expect(badge.querySelector('.material-symbols-outlined')?.textContent?.trim()).toBe(
      'video_file',
    );
    expect(badge.querySelector('.health-badge')?.getAttribute('aria-label')).toBe('CDN: Healthy');
  });

  it.each([
    ['Backend', 'Backend: Healthy'],
    ['CDN', 'Content Delivery Network: Healthy'],
  ] as const)(
    'shows the %s status popup after a long press and fades it out',
    async (service, text) => {
      const statusFixture = TestBed.createComponent(HealthBadge);
      statusFixture.componentRef.setInput('service', service);
      await statusFixture.whenStable();
      vi.useFakeTimers();
      const badge = statusFixture.nativeElement.querySelector('.health-badge') as HTMLElement;
      badge.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(500);
      statusFixture.detectChanges();
      expect(statusFixture.nativeElement.querySelector('.status-popup')?.textContent.trim()).toBe(
        text,
      );

      vi.advanceTimersByTime(3000);
      statusFixture.detectChanges();
      expect(statusFixture.nativeElement.querySelector('.status-popup')?.classList).toContain(
        'fading',
      );

      vi.advanceTimersByTime(200);
      statusFixture.detectChanges();
      expect(statusFixture.nativeElement.querySelector('.status-popup')).toBeNull();
      vi.useRealTimers();
    },
  );
  it('shows the current status popup when clicked', async () => {
    fixture.nativeElement.querySelector('.health-badge').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.status-popup')?.textContent.trim()).toBe(
      'Backend: Healthy',
    );
  });
});
