import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NEVER } from 'rxjs';
import { ApiService, FeedItem } from '../../core/api.service';
import { GAME_RUNTIME_SOURCE } from '../../engine/gameRuntimeToken';
import { Home } from './home';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        { provide: ApiService, useValue: { nextItem: () => NEVER } },
        { provide: GAME_RUNTIME_SOURCE, useValue: '' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('ignores swipes while a game is showing', () => {
    const home = component as unknown as {
      item: WritableSignal<FeedItem | null>;
      next(): Promise<void>;
      onTouchStart(event: TouchEvent): void;
      onTouchEnd(event: TouchEvent): void;
    };
    const next = vi.spyOn(home, 'next').mockResolvedValue();
    const swipeUp = () => {
      home.onTouchStart({ touches: [{ clientY: 400 }] } as unknown as TouchEvent);
      home.onTouchEnd({ changedTouches: [{ clientY: 200 }] } as unknown as TouchEvent);
    };

    home.item.set({ type: 'game', id: 'g', title: 'Quiz', url: 'quiz.js', round_id: 'r', data: { context: 'Quiz' } });
    swipeUp();
    expect(next).not.toHaveBeenCalled();

    home.item.set({ type: 'video', id: 'v', title: 'Clip', url: 'clip.mp4' });
    swipeUp();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
