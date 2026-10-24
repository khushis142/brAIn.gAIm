import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-upload-dropzone',
  styleUrl: './upload-dropzone.css',
  templateUrl: './upload-dropzone.html',
})
export class UploadDropzone {
  readonly disabled = input(false);
  readonly filesSelected = output<File[]>();
  protected readonly dragging = signal(false);

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emit(input.files);
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.emit(event.dataTransfer?.files ?? null);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  private emit(files: FileList | null): void {
    if (files?.length) {
      this.filesSelected.emit(Array.from(files));
    }
  }
}
