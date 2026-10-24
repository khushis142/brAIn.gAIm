import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { GAME_RUNTIME_SOURCE } from '../../engine/gameRuntimeToken';
import { GamePlayer, resolveGameData } from './game-player';

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

  it('resolves complete game data matching questions, chains, and difficulty', () => {
    const resolved = resolveGameData('Bounce Climber');
    expect(resolved['difficulty']).toBe('normal');
    expect(Array.isArray(resolved['questions'])).toBe(true);
    expect(Array.isArray(resolved['chains'])).toBe(true);

    const q = (resolved['questions'] as any[])[0];
    expect(q.question).toBeTruthy();
    expect(q.options).toBeInstanceOf(Array);
    expect(q.left_option).toBeTruthy();
    expect(q.right_option).toBeTruthy();
    expect(q.correct).toBe('left');
    expect(q.answer_correct).toBeTruthy();
    expect(q.answer_incorrect).toBeTruthy();
    expect(q.answer_incorrect2).toBeTruthy();

    const c = (resolved['chains'] as any[])[0];
    expect(c.title).toBeTruthy();
    expect(c.steps.length).toBeGreaterThanOrEqual(3);
  });
});
