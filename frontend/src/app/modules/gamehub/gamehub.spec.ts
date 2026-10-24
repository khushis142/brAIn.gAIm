import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService, ContentRead } from '../../core/api.service';
import { GAME_RUNTIME_SOURCE } from '../../engine/gameRuntimeToken';
import { Gamehub } from './gamehub';

const mockGames: ContentRead[] = [
  {
    id: 'g1',
    kind: 'game',
    title: 'Bounce Climber',
    tags: ['quiz', 'action'],
    owner: 'alice',
    url: 'http://cdn/bounce.js',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'g2',
    kind: 'game',
    title: 'Dodge Game',
    tags: ['reflex'],
    owner: 'bob',
    url: 'http://cdn/dodge.js',
    created_at: '2026-01-02T00:00:00Z',
  },
];

describe('Gamehub', () => {
  let component: Gamehub;
  let fixture: ComponentFixture<Gamehub>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Gamehub],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            listGames: () => of(mockGames),
            listContent: () => of(mockGames),
            getMe: () => of({ username: 'tester' }),
            getLeaderboard: () => of([{ username: 'top1', score: 100 }]),
            submitScore: () => of(undefined),
            playGame: (id: string) =>
              of({
                type: 'game' as const,
                id,
                title: 'Game',
                url: 'http://cdn/game.js',
                round_id: 'r1',
                data: {},
                assets: [],
              }),
          },
        },
        { provide: GAME_RUNTIME_SOURCE, useValue: '' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Gamehub);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads and lists available games', async () => {
    await component.loadGames();
    expect(component['games']().length).toBe(2);
    expect(component['availableTags']()).toEqual(['action', 'quiz', 'reflex']);
  });

  it('filters games by search query and tags', async () => {
    await component.loadGames();

    component['searchQuery'].set('bounce');
    expect(component['filteredGames']().length).toBe(1);
    expect(component['filteredGames']()[0].title).toBe('Bounce Climber');

    component['searchQuery'].set('');
    component['selectedTag'].set('reflex');
    expect(component['filteredGames']().length).toBe(1);
    expect(component['filteredGames']()[0].title).toBe('Dodge Game');
  });

  it('selects and deselects games to play', () => {
    component.selectGame(mockGames[0]);
    expect(component['selectedGame']()).toEqual(mockGames[0]);

    component.closeGame();
    expect(component['selectedGame']()).toBeNull();
  });
});
