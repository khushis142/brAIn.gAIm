import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiService } from '../../../core/api.service';
import { FeedEntry } from '../feed';
import { FeedCard } from './feed-card';

describe('FeedCard', () => {
  let fixture: ComponentFixture<FeedCard>;
  let api: { setContentLike: ReturnType<typeof vi.fn> };
  const entry: FeedEntry = {
    key: 1,
    item: {
      type: 'video',
      id: 'video-id',
      title: 'Biology',
      url: 'video.mp4',
      liked: false,
      like_count: 3,
    },
  };

  beforeEach(async () => {
    api = {
      setContentLike: vi.fn(() => of({ liked: true, like_count: 4 })),
    };
    await TestBed.configureTestingModule({
      imports: [FeedCard],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedCard);
    fixture.componentRef.setInput('entry', entry);
    fixture.detectChanges();
  });

  it('sends a like and emits the updated count', async () => {
    const changed = vi.fn();
    fixture.componentInstance.likeChanged.subscribe(changed);
    fixture.nativeElement.querySelector('.like').click();
    await fixture.whenStable();

    expect(api.setContentLike).toHaveBeenCalledWith('video-id', true);
    expect(changed).toHaveBeenCalledWith({ liked: true, like_count: 4 });
  });

  it('shows the saved like state and total', () => {
    fixture.componentRef.setInput('entry', {
      ...entry,
      item: { ...entry.item, liked: true, like_count: 4 },
    });
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.like') as HTMLButtonElement;
    expect(button.classList.contains('liked')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.querySelector('.like-count')?.textContent?.trim()).toBe('4');
  });
});
