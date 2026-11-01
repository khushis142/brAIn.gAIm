import { afterNextRender, Component, computed, ElementRef, input, output, viewChild } from '@angular/core';
import { LucidePlay } from '@lucide/angular';
import { GameUiDesign } from '../../engine/gameProtocol';

let nextId = 0;

/**
 * The host's pause menu over a paused game. Its text and look come from the game's
 * `setUiDesign()`; everything has a default, since games may not set any.
 */
@Component({
  imports: [LucidePlay],
  selector: 'app-game-pause-menu',
  styleUrl: './game-pause-menu.css',
  templateUrl: './game-pause-menu.html',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': 'titleId',
    '[attr.data-accent]': 'design().theme?.accent',
    '[class.light]': "design().theme?.panel === 'light'",
    '[class.compact]': "design().theme?.density === 'compact'",
    '(keydown.escape)': 'resume.emit()',
  },
})
export class GamePauseMenu {
  readonly design = input<GameUiDesign>({});
  readonly resume = output<void>();

  protected readonly titleId = `game-pause-title-${nextId++}`;
  protected readonly menu = computed(() => this.design().pauseMenu);
  private readonly resumeButton = viewChild.required<ElementRef<HTMLButtonElement>>('resumeButton');

  constructor() {
    // Keyboard and screen reader users land on the way back into the game
    afterNextRender(() => this.resumeButton().nativeElement.focus());
  }
}
