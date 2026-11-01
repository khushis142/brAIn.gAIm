import { Component, computed, input, output } from '@angular/core';

export type FileKind = 'document' | 'image' | 'pdf';

export interface UploadedFile {
  id: string;
  name: string;
  description: string;
  kind: FileKind;
  previewUrl?: string;
}

const ICONS: Record<FileKind, { name: string; color: string }> = {
  document: { name: 'description', color: '#8ab4ff' },
  image: { name: 'image', color: '#d9822b' },
  pdf: { name: 'picture_as_pdf', color: '#e57373' },
};

@Component({
  selector: 'app-file-item',
  styleUrl: './file-item.css',
  templateUrl: './file-item.html',
})
export class FileItem {
  readonly file = input.required<UploadedFile>();
  readonly remove = output<UploadedFile>();

  protected readonly icon = computed(() => ICONS[this.file().kind]);
}
