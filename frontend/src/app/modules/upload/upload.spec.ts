import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiService, ProjectRead } from '../../core/api.service';
import { UserService } from '../user/service/user-service';
import { Upload } from './upload';

const project: ProjectRead = {
  id: 'p1',
  name: 'Mathe',
  color: '#ffc800',
  body: '',
  attachments: [
    { id: 'a1', filename: 'bild.png', url: 'http://cdn/files/a1/bild.png', created_at: '' },
    { id: 'a2', filename: 'skript.pdf', url: 'http://cdn/files/a2/skript.pdf', created_at: '' },
  ],
  created_at: '',
  updated_at: '',
};

describe('Upload', () => {
  let fixture: ComponentFixture<Upload>;
  let el: HTMLElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let userService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    localStorage.clear();
    api = {
      listProjects: vi.fn(() => of([project])),
      createProject: vi.fn((name: string) => of({ ...project, id: 'p2', name, attachments: [] })),
      updateProject: vi.fn((id: string, update: { name?: string; color?: string }) =>
        of({
          ...project,
          id,
          name: update.name ?? project.name,
          color: update.color ?? project.color,
        }),
      ),
      deleteProject: vi.fn(() => of(undefined)),
      processProjectFlashcards: vi.fn(() =>
        of([
          {
            id: 'card-1',
            title: 'Was ist Wissen?',
            body: 'Lernen.',
            created_at: '2026-10-24T22:16:27.214712Z',
          },
        ]),
      ),
      getProjectFlashcards: vi.fn(() =>
        of([
          {
            id: 'card-1',
            title: 'Was ist Wissen?',
            body: 'Lernen.',
            created_at: '2026-10-24T22:16:27.214712Z',
          },
        ]),
      ),
      uploadToCdn: vi.fn((file: File) =>
        of({ id: 'a3', filename: file.name, url: 'http://cdn/files/a3/' + file.name }),
      ),
      addAttachment: vi.fn((_: string, file: { id: string; filename: string }) =>
        of({ ...file, url: 'http://cdn/files/' + file.id, created_at: '' }),
      ),
      deleteAttachment: vi.fn(() => of(undefined)),
      deleteFromCdn: vi.fn(() => of(undefined)),
    };
    userService = {
      loadUser: vi.fn(() =>
        of({ id: 'u1', username: 'alex', interests: '', active_project_id: 'p1' }),
      ),
      setActiveProject: vi.fn((projectId: string | null) =>
        of({ id: 'u1', username: 'alex', interests: '', active_project_id: projectId }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [Upload],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: UserService, useValue: userService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Upload);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const folders = () => el.querySelectorAll('app-project-folder');

  it('loads projects and selects the active project from the user profile', () => {
    expect(folders().length).toBe(2);
    expect(folders()[1].querySelector('.folder')?.classList.contains('selected')).toBe(true);
    expect(api['getProjectFlashcards']).toHaveBeenCalledWith('p1');
    expect(el.textContent).toContain('Extrahiertes Wissen');
    expect(el.textContent).not.toContain('Was ist Wissen?');
    expect(el.querySelector('app-upload-dropzone')).not.toBeNull();
  });

  it('opens the extracted knowledge subview and renders returned flashcards', async () => {
    (el.querySelector('.knowledge-link') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('.knowledge-subview h2')?.textContent).toContain(
      'Extrahiertes Wissen',
    );
    expect(el.textContent).toContain('Was ist Wissen?');
    expect(el.textContent).toContain('Lernen.');
    expect(el.querySelector('app-project-folder')).toBeNull();

    (el.querySelector('.back-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-project-folder')).not.toBeNull();
  });

  it('shows attachments of the selected project with an image preview', async () => {
    (folders()[1].querySelector('.folder') as HTMLElement).click();
    await fixture.whenStable();
    expect(el.querySelectorAll('app-file-item').length).toBe(2);
    expect(folders()[1].querySelector('.count')?.textContent.trim()).toBe('2');
    expect(el.querySelector('img.preview')?.getAttribute('src')).toBe(
      'http://cdn/files/a1/bild.png',
    );
  });

  it('processes knowledge for the selected project', async () => {
    (el.querySelector('.process-button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(api['processProjectFlashcards']).toHaveBeenCalledWith('p1');
  });

  it('creates a project via the API', async () => {
    (folders()[0].querySelector('.folder') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('form[role="dialog"]')).not.toBeNull();

    const input = el.querySelector('#project-name') as HTMLInputElement;
    input.value = 'Physik';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(api['createProject']).toHaveBeenCalledWith('Physik');
    expect(userService['setActiveProject']).toHaveBeenCalledWith('p2');
    expect(folders().length).toBe(3);
    expect(folders()[2].querySelector('.folder')?.classList.contains('selected')).toBe(true);
    expect(el.querySelector('form[role="dialog"]')).toBeNull();
  });

  it('renames a project with the custom name dialog', async () => {
    vi.useFakeTimers();
    (folders()[1].querySelector('.folder') as HTMLElement).dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(600);
    vi.useRealTimers();
    fixture.detectChanges();

    (el.querySelector('.action:not(.delete)') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = el.querySelector('#project-name') as HTMLInputElement;
    input.value = 'Neue Mathe';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(api['updateProject']).toHaveBeenCalledWith('p1', { name: 'Neue Mathe' });
    expect(folders()[1].textContent).toContain('Neue Mathe');
  });

  it('uploads to the CDN, registers the attachment and deletes it again', async () => {
    (folders()[1].querySelector('.folder') as HTMLElement).click();
    await fixture.whenStable();

    const input = el.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['x'], 'neu.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api['uploadToCdn']).toHaveBeenCalledWith(file);
    expect(api['addAttachment']).toHaveBeenCalledWith('p1', expect.objectContaining({ id: 'a3' }));
    expect(el.querySelectorAll('app-file-item').length).toBe(3);

    (el.querySelectorAll('button[aria-label="Datei löschen"]')[2] as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(api['deleteAttachment']).toHaveBeenCalledWith('p1', 'a3');
    expect(el.querySelectorAll('app-file-item').length).toBe(2);
  });

  it('deletes a project via long press menu', async () => {
    vi.useFakeTimers();
    (folders()[1].querySelector('.folder') as HTMLElement).dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(600);
    vi.useRealTimers();
    fixture.detectChanges();

    (el.querySelector('.action.delete') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(api['deleteProject']).toHaveBeenCalledWith('p1');
    expect(folders().length).toBe(1);
  });

  it('persists the folder color through the project API', async () => {
    vi.useFakeTimers();
    (folders()[1].querySelector('.folder') as HTMLElement).dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(600);
    vi.useRealTimers();
    fixture.detectChanges();

    (el.querySelectorAll('.swatch')[4] as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(api['updateProject']).toHaveBeenCalledWith('p1', { color: '#42a5f5' });
    expect((folders()[1].querySelector('.icon') as HTMLElement).style.color).toBe(
      'rgb(66, 165, 245)',
    );
  });

  it('locks the flashcard button after processing for the current page visit', async () => {
    const button = el.querySelector('.process-button') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.classList.contains('processing')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.classList.contains('processing')).toBe(false);
    expect(button.classList.contains('requested')).toBe(true);
  });
});
