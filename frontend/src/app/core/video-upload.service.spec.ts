import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { MAX_VIDEO_SIZE_BYTES, VideoUploadService } from './video-upload.service';

describe('VideoUploadService', () => {
  let service: VideoUploadService;
  let api: { uploadToCdn: ReturnType<typeof vi.fn>; createContent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = {
      uploadToCdn: vi.fn(),
      createContent: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: api }],
    });

    service = TestBed.inject(VideoUploadService);
  });

  function mp4File(name = 'clip.mp4', sizeBytes = 1024): File {
    return new File([new Uint8Array(sizeBytes)], name, { type: 'video/mp4' });
  }

  describe('validateFile', () => {
    it('accepts an mp4 file within the size limit', () => {
      expect(service.validateFile(mp4File())).toBeNull();
    });

    it('rejects a non-mp4 file', () => {
      const file = new File(['x'], 'clip.mov', { type: 'video/quicktime' });
      expect(service.validateFile(file)).toBe('Only .mp4 files are supported.');
    });

    it('rejects a file larger than the size limit', () => {
      const file = mp4File('clip.mp4', MAX_VIDEO_SIZE_BYTES + 1);
      expect(service.validateFile(file)).toContain('too large');
    });
  });

  describe('upload', () => {
    it('uploads to the CDN, then registers the content with the returned file id', async () => {
      api.uploadToCdn.mockReturnValue(of({ id: 'cdn-1', filename: 'clip.mp4', url: 'http://cdn/clip.mp4' }));
      api.createContent.mockReturnValue(
        of({
          id: 'content-1',
          kind: 'video',
          title: 'My clip',
          tags: ['bio'],
          owner: 'alex',
          url: 'http://cdn/clip.mp4',
          created_at: '2026-01-01T00:00:00Z',
        }),
      );

      const file = mp4File();
      const result = await new Promise((resolve) =>
        service.upload(file, 'My clip', ['bio']).subscribe({ next: resolve }),
      );

      expect(api.uploadToCdn).toHaveBeenCalledWith(file);
      expect(api.createContent).toHaveBeenCalledWith({
        id: 'cdn-1',
        filename: 'clip.mp4',
        title: 'My clip',
        tags: ['bio'],
      });
      expect(result).toEqual(expect.objectContaining({ id: 'content-1' }));
    });

    it('propagates a CDN upload failure without calling the backend', async () => {
      api.uploadToCdn.mockReturnValue(throwError(() => new Error('cdn down')));

      const file = mp4File();
      const error = await new Promise((resolve) =>
        service.upload(file, 'My clip', []).subscribe({ error: resolve }),
      );

      expect(error).toBeInstanceOf(Error);
      expect(api.createContent).not.toHaveBeenCalled();
    });

    it('propagates a backend registration failure after a successful CDN upload', async () => {
      api.uploadToCdn.mockReturnValue(of({ id: 'cdn-1', filename: 'clip.mp4', url: 'http://cdn/clip.mp4' }));
      api.createContent.mockReturnValue(throwError(() => new Error('backend down')));

      const file = mp4File();
      const error = await new Promise((resolve) =>
        service.upload(file, 'My clip', []).subscribe({ error: resolve }),
      );

      expect(error).toBeInstanceOf(Error);
      expect(api.uploadToCdn).toHaveBeenCalledWith(file);
    });
  });
});
