import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeedVideo } from './feed-video';

describe('FeedVideo', () => {
  let fixture: ComponentFixture<FeedVideo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FeedVideo] }).compileComponents();
    fixture = TestBed.createComponent(FeedVideo);
    fixture.componentRef.setInput('item', {
      type: 'video',
      id: 'v',
      title: 'Clip',
      url: 'clip.mp4',
      liked: false,
      like_count: 0,
    });
    await fixture.whenStable();
  });

  it('reports a double tap but not a single one', () => {
    const video = fixture.componentInstance as unknown as {
      onTapStart(event: PointerEvent): void;
      onTapEnd(event: PointerEvent): void;
    };
    const doubleTapped = vi.fn();
    fixture.componentInstance.doubleTapped.subscribe(doubleTapped);
    const tap = (timeStamp: number) => {
      const event = {
        clientX: 50,
        clientY: 50,
        offsetX: 50,
        offsetY: 50,
        timeStamp,
      } as PointerEvent;
      video.onTapStart(event);
      video.onTapEnd(event);
    };

    tap(1000);
    expect(doubleTapped).not.toHaveBeenCalled();
    tap(1200);
    expect(doubleTapped).toHaveBeenCalledTimes(1);
  });

  it('pauses when its card is not on screen', async () => {
    const element: HTMLVideoElement = fixture.nativeElement.querySelector('video');
    const play = vi.spyOn(element, 'play').mockResolvedValue();
    const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});

    fixture.componentRef.setInput('active', true);
    await fixture.whenStable();
    expect(play).toHaveBeenCalled();

    fixture.componentRef.setInput('active', false);
    await fixture.whenStable();
    expect(pause).toHaveBeenCalled();
  });
});
