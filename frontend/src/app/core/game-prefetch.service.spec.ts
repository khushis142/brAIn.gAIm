import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiService, GameItem } from './api.service';
import { GamePrefetchService } from './game-prefetch.service';

describe('GamePrefetchService', () => {
  let service: GamePrefetchService;
  let apiSpy: { playGame: ReturnType<typeof vi.fn> };

  const mockItem: GameItem = {
    type: 'game',
    id: 'g1',
    title: 'Game 1',
    url: 'http://test',
    round_id: 'r1',
    data: { context: 'test' },
  };

  beforeEach(() => {
    apiSpy = {
      playGame: vi.fn().mockReturnValue(of(mockItem)),
    };

    TestBed.configureTestingModule({
      providers: [
        GamePrefetchService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    service = TestBed.inject(GamePrefetchService);
  });

  it('prefetches and caches game items', async () => {
    service.prefetch('g1');
    expect(service.has('g1')).toBe(true);
    expect(apiSpy.playGame).toHaveBeenCalledWith('g1');

    // Repeated call does not duplicate request
    service.prefetch('g1');
    expect(apiSpy.playGame).toHaveBeenCalledTimes(1);

    const consumed = await service.consume('g1');
    expect(consumed).toEqual(mockItem);
    expect(service.has('g1')).toBe(false);
  });

  it('returns null when consuming an uncached game', async () => {
    const result = await service.consume('unknown');
    expect(result).toBeNull();
  });
});
