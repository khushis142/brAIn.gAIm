import { TestBed } from '@angular/core/testing';
import { Zombie } from './zombie';

describe('Zombie', () => {
  const render = (equipped: unknown, avatar: string | null = null) => {
    const fixture = TestBed.createComponent(Zombie);
    fixture.componentRef.setInput('equipped', equipped);
    fixture.componentRef.setInput('avatar', avatar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const hrefsIn = (anchor: string) =>
      [...element.querySelectorAll(`g.${anchor} use`)].map((use) => use.getAttribute('href'));
    return { fixture, element, hrefsIn };
  };

  afterEach(() => vi.useRealTimers());

  it('draws the bare zombie when nothing is equipped', () => {
    const { element, hrefsIn } = render(null);

    expect(element.querySelectorAll('use')).toHaveLength(6);
    expect(hrefsIn('head')).toEqual(['/assets/zombie/zombie.svg#head']);
  });

  it('attaches accessories to the limbs they move with, glasses under the hat', () => {
    const { hrefsIn } = render({ head: 'hat', eyes: 'sunglasses', neck: null, feet: 'red-sneakers' });

    expect(hrefsIn('head')).toEqual([
      '/assets/zombie/zombie.svg#head',
      '/assets/zombie/sunglasses.svg#sunglasses',
      '/assets/zombie/hat.svg#hat',
    ]);
    expect(hrefsIn('leg-l')).toEqual([
      '/assets/zombie/zombie.svg#leg-l',
      '/assets/zombie/red-sneakers.svg#shoe-l',
    ]);
    expect(hrefsIn('leg-r')).toContain('/assets/zombie/red-sneakers.svg#shoe-r');
  });

  it('skips accessories it has no art for', () => {
    const { element } = render({ head: 'mystery-crown', eyes: null, neck: null, feet: null });

    expect(element.querySelectorAll('use')).toHaveLength(6);
  });

  it('keeps the same accessories when the avatar changes', () => {
    const { hrefsIn } = render({ head: 'hat', eyes: null, neck: null, feet: null }, 'human');

    expect(hrefsIn('head')).toEqual(['/assets/zombie/human.svg#head', '/assets/zombie/hat.svg#hat']);
  });

  it('falls back to the zombie for avatars without art', () => {
    const { hrefsIn } = render(null, 'robot');

    expect(hrefsIn('head')).toEqual(['/assets/zombie/zombie.svg#head']);
  });

  it('fades the new avatar in over the old one, then drops the old one', () => {
    vi.useFakeTimers();
    const { fixture, element, hrefsIn } = render(null, 'zombie');

    fixture.componentRef.setInput('avatar', 'half-human');
    fixture.detectChanges();
    expect(hrefsIn('head')).toEqual([
      '/assets/zombie/zombie.svg#head',
      '/assets/zombie/half-human.svg#head',
    ]);
    expect(element.querySelector('g.head use.avatar-in')?.getAttribute('href')).toBe(
      '/assets/zombie/half-human.svg#head',
    );

    vi.advanceTimersByTime(500);
    fixture.detectChanges();
    expect(hrefsIn('head')).toEqual(['/assets/zombie/half-human.svg#head']);
  });

  it('does not fade when the first avatar arrives', () => {
    const { fixture, hrefsIn } = render(null);

    fixture.componentRef.setInput('avatar', 'human');
    fixture.detectChanges();
    expect(hrefsIn('head')).toEqual(['/assets/zombie/human.svg#head']);
  });
});
