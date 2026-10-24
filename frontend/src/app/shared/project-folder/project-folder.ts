import { Component, input, output, signal } from '@angular/core';

export const FOLDER_COLORS = [
  '#ffc800',
  '#ff7043',
  '#ef5350',
  '#ab47bc',
  '#42a5f5',
  '#26a69a',
  '#66bb6a',
];
export const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0];

const LONG_PRESS_MS = 500;

@Component({
  selector: 'app-project-folder',
  styleUrl: './project-folder.css',
  templateUrl: './project-folder.html',
})
export class ProjectFolder {
  readonly name = input('');
  readonly color = input(DEFAULT_FOLDER_COLOR);
  readonly count = input(0);
  readonly isNew = input(false);
  readonly selected = input(false);
  readonly pressed = output<void>();
  readonly colorChange = output<string>();
  readonly remove = output<void>();
  readonly rename = output<void>();

  protected readonly colors = FOLDER_COLORS;
  protected readonly menuOpen = signal(false);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private longPressed = false;

  protected startPress(): void {
    if (this.isNew()) {
      return;
    }
    this.longPressed = false;
    this.cancelPress();
    this.timer = setTimeout(() => {
      this.longPressed = true;
      this.menuOpen.set(true);
    }, LONG_PRESS_MS);
  }

  protected cancelPress(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  protected onClick(): void {
    if (this.longPressed) {
      this.longPressed = false;
      return;
    }
    this.pressed.emit();
  }

  protected suppressNativeMenu(event: Event): void {
    event.preventDefault();
  }

  protected pickColor(color: string): void {
    this.colorChange.emit(color);
    this.menuOpen.set(false);
  }

  protected delete(): void {
    this.menuOpen.set(false);
    this.remove.emit();
  }

  protected startRename(): void {
    this.menuOpen.set(false);
    this.rename.emit();
  }
}
