import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { LucideCloudUpload, LucideFileVideo, LucideUpload, LucideX } from '@lucide/angular';
import { MAX_VIDEO_SIZE_BYTES, VideoUploadService } from '../../core/video-upload.service';

type Status = 'idle' | 'uploading' | 'success' | 'error';

@Component({
  imports: [LucideCloudUpload, LucideFileVideo, LucideUpload, LucideX],
  selector: 'app-video-upload',
  styleUrl: './video-upload.css',
  templateUrl: './video-upload.html',
})
export class VideoUpload {
  private readonly uploadService = inject(VideoUploadService);

  @ViewChild('fileInput') private readonly fileInput?: ElementRef<HTMLInputElement>;

  protected readonly maxSizeMb = MAX_VIDEO_SIZE_BYTES / 1024 / 1024;
  protected readonly file = signal<File | null>(null);
  protected readonly title = signal('');
  protected readonly tagsInput = signal('');
  protected readonly status = signal<Status>('idle');
  protected readonly error = signal<string | null>(null);
  protected readonly dragging = signal(false);

  protected readonly canSubmit = computed(
    () => this.file() !== null && this.title().trim().length > 0 && this.status() !== 'uploading',
  );

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.selectFile(input.files?.[0] ?? null)) {
      input.value = '';
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.status() !== 'uploading') {
      this.dragging.set(true);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped && this.status() !== 'uploading') {
      this.clearFileInput();
      this.selectFile(dropped);
    }
  }

  protected clearFile(): void {
    this.file.set(null);
    this.error.set(null);
    this.clearFileInput();
  }

  protected onTitleInput(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }

  protected onTagsInput(event: Event): void {
    this.tagsInput.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const file = this.file();
    if (!file) {
      return;
    }

    this.status.set('uploading');
    this.error.set(null);

    this.uploadService.upload(file, this.title().trim(), this.parseTags()).subscribe({
      next: () => {
        this.status.set('success');
        this.resetForm();
      },
      error: () => {
        this.status.set('error');
        this.error.set('Video could not be uploaded.');
      },
    });
  }

  /** Validates and stores the file; returns false when it was rejected. */
  private selectFile(selected: File | null): boolean {
    this.error.set(null);
    this.status.set('idle');

    if (selected) {
      const validationError = this.uploadService.validateFile(selected);
      if (validationError) {
        this.error.set(validationError);
        this.file.set(null);
        return false;
      }
    }
    this.file.set(selected);
    return true;
  }

  private parseTags(): string[] {
    return this.tagsInput()
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  private clearFileInput(): void {
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  private resetForm(): void {
    this.file.set(null);
    this.title.set('');
    this.tagsInput.set('');
    this.clearFileInput();
  }
}
