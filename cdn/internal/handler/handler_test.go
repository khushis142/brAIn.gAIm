package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/brAIn-gAIm/CDN/internal/config"
	"github.com/brAIn-gAIm/CDN/internal/storage"
)

type mockS3 struct {
	mu      sync.RWMutex
	objects map[string][]byte
}

func newMockS3() *mockS3 {
	return &mockS3{objects: make(map[string][]byte)}
}

func (m *mockS3) Ping(ctx context.Context) error {
	return nil
}

func (m *mockS3) Upload(ctx context.Context, key string, body io.Reader, size int64, contentType string, metadata map[string]string) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.objects[key] = data
	m.mu.Unlock()
	return nil
}

func (m *mockS3) Get(ctx context.Context, key string, rangeHeader string) (*storage.ObjectReader, error) {
	m.mu.RLock()
	data, ok := m.objects[key]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("object %s not found", key)
	}

	reader := io.NopCloser(bytes.NewReader(data))
	return &storage.ObjectReader{
		Body:          reader,
		ContentType:   "video/mp4",
		ContentLength: int64(len(data)),
		ETag:          `"mock-etag"`,
	}, nil
}

func (m *mockS3) Delete(ctx context.Context, key string) error {
	m.mu.Lock()
	delete(m.objects, key)
	m.mu.Unlock()
	return nil
}

func (m *mockS3) FindKeyByID(ctx context.Context, id string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	prefix := id + "/"
	for k := range m.objects {
		if strings.HasPrefix(k, prefix) || k == id {
			return k, nil
		}
	}
	return "", fmt.Errorf("object not found for %s", id)
}

func (m *mockS3) DeleteByID(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	prefix := id + "/"
	for k := range m.objects {
		if strings.HasPrefix(k, prefix) || k == id {
			delete(m.objects, k)
		}
	}
	return nil
}

func setupTestServer() (http.Handler, *mockS3) {
	cfg := &config.Config{
		Port:          "8080",
		CDNBaseURL:    "http://localhost:8080",
		MaxUploadSize: 50 * 1024 * 1024,
		S3Bucket:      "test-bucket",
	}
	s3 := newMockS3()
	h := New(cfg, s3)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)
	return mux, s3
}

func TestValidateAssetType(t *testing.T) {
	tests := []struct {
		filename    string
		headerType  string
		expected    string
		shouldError bool
	}{
		{"test.mp4", "", "video/mp4", false},
		{"video.MP4", "", "video/mp4", false},
		{"song.mp3", "", "audio/mpeg", false},
		{"sound.wav", "", "audio/wav", false},
		{"track.ogg", "", "audio/ogg", false},
		{"clip.m4a", "", "audio/mp4", false},
		{"audio.aac", "", "audio/aac", false},
		{"music.flac", "", "audio/flac", false},
		{"audio.weba", "", "audio/webm", false},
		{"voice.opus", "", "audio/opus", false},
		{"audio.xyz", "audio/wav", "audio/wav", false},
		{"bundle.js", "", "application/javascript", false},
		{"module.mjs", "", "application/javascript", false},
		{"doc.pdf", "", "application/pdf", false},
		{"notes.txt", "", "text/plain; charset=utf-8", false},
		{"readme.md", "", "text/markdown; charset=utf-8", false},
		{"pic.png", "", "image/png", false},
		{"avatar.jpg", "", "image/jpeg", false},
		{"logo.svg", "", "image/svg+xml", false},
		{"test.xyz", "application/pdf", "application/pdf", false},
		{"malicious.exe", "application/x-msdownload", "", true},
		{"binary.bin", "application/octet-stream", "", true},
	}

	for _, tt := range tests {
		got, err := validateAssetType(tt.filename, tt.headerType)
		if tt.shouldError && err == nil {
			t.Errorf("validateAssetType(%q, %q) expected error, got nil", tt.filename, tt.headerType)
		}
		if !tt.shouldError && (err != nil || got != tt.expected) {
			t.Errorf("validateAssetType(%q, %q) = (%q, %v); want %q", tt.filename, tt.headerType, got, err, tt.expected)
		}
	}
}

func TestUploadAndDeliverFile(t *testing.T) {
	handler, _ := setupTestServer()

	// 1. Upload single file
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "sample.mp4")
	if err != nil {
		t.Fatal(err)
	}
	dummyContent := []byte("sample mp4 content")
	_, _ = part.Write(dummyContent)
	_ = writer.Close()

	req := httptest.NewRequest("POST", "/api/v1/files", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var res map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	id := res["id"]
	if id == "" {
		t.Fatal("expected non-empty id in response")
	}
	if !strings.HasPrefix(res["url"], "http://localhost:8080/files/") {
		t.Fatalf("unexpected url format: %s", res["url"])
	}

	// 2. Deliver file by ID
	delivReq := httptest.NewRequest("GET", "/files/"+id, nil)
	delivRec := httptest.NewRecorder()
	handler.ServeHTTP(delivRec, delivReq)

	if delivRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", delivRec.Code, delivRec.Body.String())
	}
	if delivRec.Body.String() != string(dummyContent) {
		t.Fatalf("delivered content mismatch: got %q", delivRec.Body.String())
	}

	// 3. Update file
	upBody := &bytes.Buffer{}
	upWriter := multipart.NewWriter(upBody)
	upPart, _ := upWriter.CreateFormFile("file", "updated.mp4")
	newContent := []byte("updated mp4 content")
	_, _ = upPart.Write(newContent)
	_ = upWriter.Close()

	upReq := httptest.NewRequest("PUT", "/api/v1/files/"+id, upBody)
	upReq.Header.Set("Content-Type", upWriter.FormDataContentType())
	upRec := httptest.NewRecorder()
	handler.ServeHTTP(upRec, upReq)

	if upRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for update, got %d: %s", upRec.Code, upRec.Body.String())
	}

	// 4. Delete file
	delReq := httptest.NewRequest("DELETE", "/api/v1/files/"+id, nil)
	delRec := httptest.NewRecorder()
	handler.ServeHTTP(delRec, delReq)

	if delRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content, got %d", delRec.Code)
	}

	// 5. Verify 404 after deletion
	getReq := httptest.NewRequest("GET", "/files/"+id, nil)
	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, getReq)

	if getRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found, got %d", getRec.Code)
	}
}

func TestSwaggerEndpoints(t *testing.T) {
	handler, _ := setupTestServer()

	req := httptest.NewRequest("GET", "/swagger/openapi.yaml", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for /swagger/openapi.yaml, got %d", rec.Code)
	}
}
