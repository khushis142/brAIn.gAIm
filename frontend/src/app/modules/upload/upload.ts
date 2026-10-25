import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import {
  ApiService,
  AttachmentRead,
  ProjectFlashcardRead,
  ProjectRead,
} from '../../core/api.service';
import { FileItem, FileKind, UploadedFile } from '../../shared/file-item/file-item';
import { DEFAULT_FOLDER_COLOR, ProjectFolder } from '../../shared/project-folder/project-folder';
import { UploadDropzone } from '../../shared/upload-dropzone/upload-dropzone';
import { UserService } from '../user/service/user-service';
import {LucideBrain} from '@lucide/angular';

interface Project {
  id: string;
  name: string;
  color: string;
  files: UploadedFile[];
}

type ProjectNameDialog =
  { mode: 'create'; name: string } | { mode: 'rename'; projectId: string; name: string };

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
  imports: [FileItem, ProjectFolder, UploadDropzone, LucideBrain],
  selector: 'app-upload',
  styleUrl: './upload.css',
  templateUrl: './upload.html',
})
export class Upload implements OnInit {
  private readonly api = inject(ApiService);
  private readonly userService = inject(UserService);
  protected readonly extractingLabel = [...'Extracting knowledge'];

  protected readonly projects = signal<Project[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly flashcards = signal<ProjectFlashcardRead[]>([]);
  protected readonly flashcardsLoading = signal(false);
  protected readonly flashcardsRequested = signal(false);
  protected readonly processingFlashcards = signal(false);
  protected readonly knowledgeViewOpen = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly nameDialog = signal<ProjectNameDialog | null>(null);

  protected readonly selected = computed(
    () => this.projects().find((project) => project.id === this.selectedId()) ?? null,
  );

  ngOnInit(): void {
    forkJoin({
      user: this.userService.loadUser(),
      projects: this.api.listProjects(),
    }).subscribe({
      next: ({ user, projects }) => {
        this.projects.set(projects.map((project) => this.toProject(project)));
        this.selectedId.set(
          projects.some((project) => project.id === user.active_project_id)
            ? (user.active_project_id ?? null)
            : null,
        );
        if (
          user.active_project_id &&
          projects.some((project) => project.id === user.active_project_id)
        ) {
          this.loadFlashcards(user.active_project_id);
        }
      },
      error: () => this.error.set('Knowledge could not be loaded.'),
    });
  }

  protected openCreateProject(): void {
    this.nameDialog.set({ mode: 'create', name: '' });
  }

  protected openRenameProject(project: Project): void {
    this.nameDialog.set({ mode: 'rename', projectId: project.id, name: project.name });
  }

  protected updateProjectName(event: Event): void {
    const dialog = this.nameDialog();
    if (dialog) {
      this.nameDialog.set({ ...dialog, name: (event.target as HTMLInputElement).value });
    }
  }

  protected async saveProjectName(): Promise<void> {
    const dialog = this.nameDialog();
    const name = dialog?.name.trim();
    if (!dialog || !name || this.busy()) {
      return;
    }

    if (dialog.mode === 'create') {
      let createdId: string | null = null;
      await this.run('Project could not be created.', async () => {
        const created = await firstValueFrom(this.api.createProject(name));
        createdId = created.id;
        this.projects.update((projects) => [...projects, this.toProject(created)]);
        this.nameDialog.set(null);
      });
      if (createdId) {
        await this.switchProject(createdId);
      }
      return;
    }

    if (name === this.findProject(dialog.projectId)?.name) {
      this.nameDialog.set(null);
      return;
    }
    await this.run('Project could not be renamed.', async () => {
      const updated = await firstValueFrom(this.api.updateProject(dialog.projectId, { name }));
      this.patchProject(dialog.projectId, { name: updated.name });
      this.nameDialog.set(null);
    });
  }

  protected async setColor(id: string, color: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    await this.run('Folder color could not be saved.', async () => {
      const updated = await firstValueFrom(this.api.updateProject(id, { color }));
      this.patchProject(id, { color: updated.color ?? color });
    });
  }

  protected async switchProject(id: string): Promise<void> {
    if (id === this.selectedId() || this.busy()) {
      return;
    }
    await this.run('Project could not be selected.', async () => {
      await firstValueFrom(this.userService.setActiveProject(id));
      this.selectedId.set(id);
      this.loadFlashcards(id);
    });
  }

  protected async removeProject(id: string): Promise<void> {
    await this.run('Project could not be deleted.', async () => {
      await firstValueFrom(this.api.deleteProject(id));
      this.projects.update((projects) => projects.filter((project) => project.id !== id));
      if (this.selectedId() === id) {
        this.selectedId.set(null);
      }
    });
  }

  protected async addFiles(files: File[]): Promise<void> {
    const projectId = this.selectedId();
    if (!projectId) {
      return;
    }
    await this.run('Upload failed.', async () => {
      for (const file of files) {
        const uploaded = await firstValueFrom(this.api.uploadToCdn(file));
        const attachment = await firstValueFrom(this.api.addAttachment(projectId, uploaded));
        this.patchProject(projectId, {
          files: [...(this.findProject(projectId)?.files ?? []), toFile(attachment)],
        });
      }
    });
  }

  protected async processKnowledge(): Promise<void> {
    const projectId = this.selectedId();
    if (!projectId || this.flashcardsRequested() || this.busy()) {
      return;
    }
    this.flashcardsRequested.set(true);
    this.processingFlashcards.set(true);
    await this.run('Knowledge could not be processed.', async () => {
      this.flashcards.set(await firstValueFrom(this.api.processProjectFlashcards(projectId)));
      this.flashcardsLoading.set(false);
    });
    this.processingFlashcards.set(false);
  }

  protected openKnowledgeView(): void {
    this.knowledgeViewOpen.set(true);
  }

  protected closeKnowledgeView(): void {
    this.knowledgeViewOpen.set(false);
  }

  private loadFlashcards(projectId: string): void {
    this.flashcards.set([]);
    this.flashcardsLoading.set(true);
    this.api.getProjectFlashcards(projectId).subscribe({
      next: (flashcards) => {
        if (this.selectedId() === projectId) {
          this.flashcards.set(flashcards);
          this.flashcardsLoading.set(false);
        }
      },
      error: () => {
        if (this.selectedId() === projectId) {
          this.flashcardsLoading.set(false);
          this.error.set('Extracted knowledge could not be loaded.');
        }
      },
    });
  }

  protected async removeFile(file: UploadedFile): Promise<void> {
    const projectId = this.selectedId();
    if (!projectId) {
      return;
    }
    await this.run('File could not be deleted.', async () => {
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

  private toProject(project: ProjectRead): Project {
    return {
      id: project.id,
      name: project.name,
      color: project.color ?? DEFAULT_FOLDER_COLOR,
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

}
