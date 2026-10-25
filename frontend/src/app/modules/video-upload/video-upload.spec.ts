import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { ContentRead } from '../../core/api.service';
import { VideoUploadService } from '../../core/video-upload.service';
import { VideoUpload } from './video-upload';

function mp4File(name = 'clip.mp4', sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'video/mp4' });
}

function selectFile(el: HTMLElement, file: File | null): void {
  const input = el.querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: file ? [file] : [], configurable: true });
  input.dispatchEvent(new Event('change'));
}

function setTitle(el: HTMLElement, value: string): void {
  setTextInput(el, 0, value);
}

function setTags(el: HTMLElement, value: string): void {
  setTextInput(el, 1, value);
}

function setTextInput(el: HTMLElement, index: number, value: string): void {
  const input = el.querySelectorAll('input[type=text]')[index] as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('VideoUpload', () => {
  let fixture: ComponentFixture<VideoUpload>;
  let el: HTMLElement;
  let uploadService: { validateFile: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    uploadService = {
      validateFile: vi.fn(() => null),
      upload: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [VideoUpload],
      providers: [{ provide: VideoUploadService, useValue: uploadService }],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoUpload);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const submitButton = () => el.querySelector('button[type=submit]') as HTMLButtonElement;

  it('disables submit until a valid file and a title are present', async () => {
    expect(submitButton().disabled).toBe(true);

    selectFile(el, mp4File());
    fixture.detectChanges();
    expect(submitButton().disabled).toBe(true);

    setTitle(el, 'My clip');
    fixture.detectChanges();
    expect(submitButton().disabled).toBe(false);
  });

  it('shows a client-side error and clears the selection when validation fails', () => {
    uploadService.validateFile.mockReturnValue('Only .mp4 files are supported.');
    selectFile(el, new File(['x'], 'clip.mov', { type: 'video/quicktime' }));
    fixture.detectChanges();

    expect(el.querySelector('.error')?.textContent).toContain('Only .mp4 files');
    expect(el.querySelector('.hint')).toBeNull();
  });

  it('uploads the file with the title and parsed tags, and shows a success message', async () => {
    const content: ContentRead = {
      id: 'content-1',
      kind: 'video',
      title: 'My clip',
      tags: ['bio', 'exam'],
      owner: 'testuploader',
      url: 'http://cdn/clip.mp4',
      created_at: '2026-01-01T00:00:00Z',
    };
    uploadService.upload.mockReturnValue(of(content));

    const file = mp4File();
    selectFile(el, file);
    setTitle(el, 'My clip');
    setTags(el, 'bio, exam');
    fixture.detectChanges();

    submitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(uploadService.upload).toHaveBeenCalledWith(file, 'My clip', ['bio', 'exam']);
    expect(el.querySelector('.success')?.textContent).toContain('erfolgreich');
    expect(el.querySelector('.error')).toBeNull();
  });

  it('shows a loading state while the upload is in flight', async () => {
    const pending = new Subject<ContentRead>();
    uploadService.upload.mockReturnValue(pending);

    selectFile(el, mp4File());
    setTitle(el, 'My clip');
    fixture.detectChanges();

    submitButton().click();
    fixture.detectChanges();

    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toContain('Uploading');

    pending.complete();
    await fixture.whenStable();
  });

  it('shows an error message when the CDN upload fails', async () => {
    uploadService.upload.mockReturnValue(throwError(() => new Error('cdn down')));

    selectFile(el, mp4File());
    setTitle(el, 'My clip');
    fixture.detectChanges();

    submitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.error')?.textContent).toContain('konnte nicht hochgeladen werden');
    expect(el.querySelector('.success')).toBeNull();
  });

  it('shows an error message when the backend registration fails', async () => {
    uploadService.upload.mockReturnValue(throwError(() => new Error('backend down')));

    selectFile(el, mp4File());
    setTitle(el, 'My clip');
    fixture.detectChanges();

    submitButton().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.error')?.textContent).toContain('konnte nicht hochgeladen werden');
  });
});
