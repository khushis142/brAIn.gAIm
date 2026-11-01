import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiService } from '../../../core/api.service';
import { FeedEntry, FeedSound } from '../feed';
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
    saved: { videoTime: 0, gameResult: null },
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

  describe('sound control', () => {
    const pointer = (target: EventTarget, type: string, pointerType: string) => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { pointerType });
      target.dispatchEvent(event);
      fixture.detectChanges();
    };
    const control = () => fixture.nativeElement.querySelector('.sound') as HTMLElement;
    const isOpen = () => control().classList.contains('open');

    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps the slider open after a tap until the finger has been off it for a while', () => {
      vi.useFakeTimers();
      pointer(control(), 'pointerdown', 'touch');
      pointer(control(), 'pointerup', 'touch');
      expect(isOpen()).toBe(true);

      vi.advanceTimersByTime(2000);
      pointer(control(), 'pointerdown', 'touch'); // dragging the slider
      vi.advanceTimersByTime(5000);
      expect(isOpen()).toBe(true);

      pointer(control(), 'pointerup', 'touch');
      vi.advanceTimersByTime(3000);
      fixture.detectChanges();
      expect(isOpen()).toBe(false);
    });

    it('closes the slider on a tap elsewhere', () => {
      pointer(control(), 'pointerup', 'touch');
      pointer(document.body, 'pointerdown', 'touch');
      expect(isOpen()).toBe(false);
    });

    it('leaves the mouse to hover', () => {
      pointer(control(), 'pointerup', 'mouse');
      expect(isOpen()).toBe(false);
    });

    it('unmutes when the slider is moved', () => {
      const sound = TestBed.inject(FeedSound);
      const slider = fixture.nativeElement.querySelector('.volume-input') as HTMLInputElement;
      slider.value = '0.4';
      slider.dispatchEvent(new Event('input'));

      expect(sound.muted()).toBe(false);
      expect(sound.volume()).toBe(0.4);
    });
  });
});
