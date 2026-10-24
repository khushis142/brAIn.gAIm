import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService, AttachmentRead, ProjectRead } from '../../core/api.service';
import { FileItem, FileKind, UploadedFile } from '../../shared/file-item/file-item';
import { DEFAULT_FOLDER_COLOR, ProjectFolder } from '../../shared/project-folder/project-folder';
import { UploadDropzone } from '../../shared/upload-dropzone/upload-dropzone';

interface Project {
  id: string;
  name: string;
  color: string;
  files: UploadedFile[];
}

const COLORS_KEY = 'braingain-folder-colors';
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];

function kindOf(filename: string): FileKind {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.includes(extension)) {
    return 'image';
  }
  return extension === 'pdf' ? 'pdf' : 'document';
}

function toFile(attachment: AttachmentRead): UploadedFile {
  const kind = kindOf(attachment.filename);
  return {
    id: attachment.id,
    name: attachment.filename,
    description: '',
    kind,
    previewUrl: kind === 'image' ? attachment.url : undefined,
  };
}

@Component({
  imports: [FileItem, ProjectFolder, UploadDropzone],
  selector: 'app-upload',
  styleUrl: './upload.css',
  templateUrl: './upload.html',
})
export class Upload implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly projects = signal<Project[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly selected = computed(
    () => this.projects().find((project) => project.id === this.selectedId()) ?? null,
  );

  ngOnInit(): void {
    this.api.listProjects().subscribe({
      next: (projects) => {
        const colors = this.loadColors();
        this.projects.set(projects.map((project) => this.toProject(project, colors)));
      },
      error: () => this.error.set('Projekte konnten nicht geladen werden.'),
    });
  }

  protected async addProject(): Promise<void> {
    const name = prompt('Projektname')?.trim();
    if (!name) {
      return;
    }
    await this.run('Projekt konnte nicht erstellt werden.', async () => {
      const created = await firstValueFrom(this.api.createProject(name));
      this.projects.update((projects) => [...projects, this.toProject(created, {})]);
      this.selectedId.set(created.id);
    });
  }

  protected async renameProject(project: Project): Promise<void> {
    const name = prompt('Projektname', project.name)?.trim();
    if (!name || name === project.name) {
      return;
    }
    await this.run('Projekt konnte nicht umbenannt werden.', async () => {
      const updated = await firstValueFrom(this.api.updateProject(project.id, { name }));
      this.patchProject(project.id, { name: updated.name });
    });
  }

  protected setColor(id: string, color: string): void {
    this.patchProject(id, { color });
    const colors = this.loadColors();
    colors[id] = color;
    localStorage.setItem(COLORS_KEY, JSON.stringify(colors));
  }

  protected async removeProject(id: string): Promise<void> {
    await this.run('Projekt konnte nicht gelöscht werden.', async () => {
      await firstValueFrom(this.api.deleteProject(id));
      this.projects.update((projects) => projects.filter((project) => project.id !== id));
      if (this.selectedId() === id) {
        this.selectedId.set(null);
      }
      const colors = this.loadColors();
      delete colors[id];
      localStorage.setItem(COLORS_KEY, JSON.stringify(colors));
    });
  }

  protected async addFiles(files: File[]): Promise<void> {
    const projectId = this.selectedId();
    if (!projectId) {
      return;
    }
    await this.run('Upload fehlgeschlagen.', async () => {
      for (const file of files) {
        const uploaded = await firstValueFrom(this.api.uploadToCdn(file));
        const attachment = await firstValueFrom(this.api.addAttachment(projectId, uploaded));
        this.patchProject(projectId, {
          files: [...(this.findProject(projectId)?.files ?? []), toFile(attachment)],
        });
      }
    });
  }

  protected async removeFile(file: UploadedFile): Promise<void> {
    const projectId = this.selectedId();
    if (!projectId) {
      return;
    }
    await this.run('Datei konnte nicht gelöscht werden.', async () => {
      await firstValueFrom(this.api.deleteAttachment(projectId, file.id));
      this.patchProject(projectId, {
        files: (this.findProject(projectId)?.files ?? []).filter((item) => item.id !== file.id),
      });
      this.api.deleteFromCdn(file.id).subscribe({ error: () => undefined });
    });
  }

  private async run(failure: string, action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await action();
    } catch {
      this.error.set(failure);
    } finally {
      this.busy.set(false);
    }
  }

  private toProject(project: ProjectRead, colors: Record<string, string>): Project {
    return {
      id: project.id,
      name: project.name,
      color: colors[project.id] ?? DEFAULT_FOLDER_COLOR,
      files: project.attachments.map(toFile),
    };
  }

  private findProject(id: string): Project | undefined {
    return this.projects().find((project) => project.id === id);
  }

  private patchProject(id: string, patch: Partial<Project>): void {
    this.projects.update((projects) =>
      projects.map((project) => (project.id === id ? { ...project, ...patch } : project)),
    );
  }

  private loadColors(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(COLORS_KEY) ?? '{}');
    } catch {
      return {};
    }
  }
}
