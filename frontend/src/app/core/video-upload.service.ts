import { Injectable, inject } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { ApiService, ContentRead } from './api.service';

export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;
const ALLOWED_VIDEO_TYPE = 'video/mp4';

@Injectable({ providedIn: 'root' })
export class VideoUploadService {
  private readonly api = inject(ApiService);

  validateFile(file: File): string | null {
    const isMp4 = file.type === ALLOWED_VIDEO_TYPE || file.name.toLowerCase().endsWith('.mp4');
    if (!isMp4) {
      return 'Only .mp4 files are supported.';
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      return `The file is too large (max. ${MAX_VIDEO_SIZE_BYTES / 1024 / 1024} MB).`;
    }
    return null;
  }

  upload(file: File, title: string, tags: string[]): Observable<ContentRead> {
    return this.api
      .uploadToCdn(file)
      .pipe(switchMap((cdnFile) => this.api.createContent({ id: cdnFile.id, filename: cdnFile.filename, title, tags })));
  }
}
