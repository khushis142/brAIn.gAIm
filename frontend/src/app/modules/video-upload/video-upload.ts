import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import {LucideSkull, LucideUpload} from '@lucide/angular';
import { VideoUploadService } from '../../core/video-upload.service';

type Status = 'idle' | 'uploading' | 'success' | 'error';

@Component({
  imports: [LucideUpload],
  selector: 'app-video-upload',
  styleUrl: './video-upload.css',
  templateUrl: './video-upload.html',
})
export class VideoUpload {
  private readonly uploadService = inject(VideoUploadService);

  @ViewChild('fileInput') private readonly fileInput?: ElementRef<HTMLInputElement>;

  protected readonly file = signal<File | null>(null);
  protected readonly title = signal('');
  protected readonly tagsInput = signal('');
  protected readonly status = signal<Status>('idle');
  protected readonly error = signal<string | null>(null);

  protected readonly canSubmit = computed(
    () => this.file() !== null && this.title().trim().length > 0 && this.status() !== 'uploading',
  );

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0] ?? null;
    this.error.set(null);
    this.status.set('idle');

    if (selected) {
      const validationError = this.uploadService.validateFile(selected);
      if (validationError) {
        this.error.set(validationError);
        this.file.set(null);
        input.value = '';
        return;
      }
    }
    this.file.set(selected);
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
        this.error.set('Video konnte nicht hochgeladen werden.');
      },
    });
  }

  private parseTags(): string[] {
    return this.tagsInput()
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  private resetForm(): void {
    this.file.set(null);
    this.title.set('');
    this.tagsInput.set('');
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }
}
