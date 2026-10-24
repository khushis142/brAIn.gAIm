import { TestBed } from '@angular/core/testing';
import { Zombie } from './zombie';

describe('Zombie', () => {
  const render = (equipped: unknown) => {
    const fixture = TestBed.createComponent(Zombie);
    fixture.componentRef.setInput('equipped', equipped);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const hrefsIn = (anchor: string) =>
      [...element.querySelectorAll(`g.${anchor} use`)].map((use) => use.getAttribute('href'));
    return { element, hrefsIn };
  };

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
});
