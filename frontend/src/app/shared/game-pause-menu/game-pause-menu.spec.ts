import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameUiDesign } from '../../engine/gameProtocol';
import { GamePauseMenu } from './game-pause-menu';

describe('GamePauseMenu', () => {
  let fixture: ComponentFixture<GamePauseMenu>;

  async function create(design: GameUiDesign = {}): Promise<HTMLElement> {
    fixture = TestBed.createComponent(GamePauseMenu);
    // In the document before the first render, so focusing works
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('design', design);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  it('falls back to default text when the game set none', async () => {
    const element = await create();

    expect(element.querySelector('.title')?.textContent?.trim()).toBe('Paused');
    expect(element.querySelector('.message')).toBeNull();
    expect(element.querySelector('.resume')?.textContent?.trim()).toBe('Resume');
  });

  it("shows the game's text and theme", async () => {
    const element = await create({
      theme: { accent: 'amber', panel: 'light', density: 'compact' },
      pauseMenu: { title: 'Break', message: 'Take a breath.', resumeLabel: 'Continue' },
    });

    expect(element.querySelector('.title')?.textContent?.trim()).toBe('Break');
    expect(element.querySelector('.message')?.textContent?.trim()).toBe('Take a breath.');
    expect(element.querySelector('.resume')?.textContent?.trim()).toBe('Continue');
    expect(element.getAttribute('data-accent')).toBe('amber');
    expect(element.classList).toContain('light');
    expect(element.classList).toContain('compact');
  });

  it('is a labelled dialog that focuses resume', async () => {
    const element = await create();

    expect(element.getAttribute('role')).toBe('dialog');
    expect(document.getElementById(element.getAttribute('aria-labelledby')!)?.textContent?.trim())
      .toBe('Paused');
    expect(document.activeElement).toBe(element.querySelector('.resume'));
  });

  it('resumes on the button and on Escape', async () => {
    const element = await create();
    const resume = vi.fn();
    fixture.componentInstance.resume.subscribe(resume);

    element.querySelector<HTMLButtonElement>('.resume')!.click();
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(resume).toHaveBeenCalledTimes(2);
  });
});
