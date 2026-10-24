import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { GAME_RUNTIME_SOURCE } from '../../engine/gameRuntimeToken';
import { GamePlayer } from './game-player';

describe('GamePlayer', () => {
  let component: GamePlayer;
  let fixture: ComponentFixture<GamePlayer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GamePlayer],
      providers: [
        {
          provide: ApiService,
          useValue: {
            getMe: () => of({ username: 'tester' }),
            submitScore: () => of(undefined),
            getLeaderboard: () => of([{ username: 'top1', score: 100 }]),
          },
        },
        { provide: GAME_RUNTIME_SOURCE, useValue: '' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GamePlayer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits close event when close is clicked', () => {
    const spy = vi.spyOn(component.close, 'emit');
    component.close.emit();
    expect(spy).toHaveBeenCalled();
  });
});
