package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/brAIn-gAIm/CDN/api"
	"github.com/brAIn-gAIm/CDN/internal/config"
	"github.com/brAIn-gAIm/CDN/internal/model"
	"github.com/brAIn-gAIm/CDN/internal/storage"
	"github.com/google/uuid"
)

type ObjectStore interface {
	Ping(ctx context.Context) error
	Upload(ctx context.Context, key string, body io.Reader, size int64, contentType string, metadata map[string]string) error
	Get(ctx context.Context, key string, rangeHeader string) (*storage.ObjectReader, error)
	Delete(ctx context.Context, key string) error
	FindKeyByID(ctx context.Context, id string) (string, error)
	DeleteByID(ctx context.Context, id string) error
}

type Handler struct {
	cfg     *config.Config
	storage ObjectStore
}

func New(cfg *config.Config, storage ObjectStore) *Handler {
	return &Handler{
		cfg:     cfg,
		storage: storage,
	}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", h.HealthCheck)

	// Swagger documentation
	mux.HandleFunc("GET /swagger/openapi.yaml", h.ServeOpenAPISpec)
	mux.HandleFunc("GET /swagger/", h.ServeSwaggerUI)
	mux.HandleFunc("GET /swagger", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/swagger/", http.StatusMovedPermanently)
	})
	mux.HandleFunc("GET /docs", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/swagger/", http.StatusMovedPermanently)
	})

	// File upload endpoints
	mux.HandleFunc("POST /api/v1/files", h.UploadFiles)
	mux.HandleFunc("POST /api/v1/assets", h.UploadFiles)
	mux.HandleFunc("POST /upload", h.UploadFiles)

	// File update / delete endpoints
	mux.HandleFunc("PUT /api/v1/files/{id}", h.UpdateFile)
	mux.HandleFunc("PUT /files/{id}", h.UpdateFile)
	mux.HandleFunc("DELETE /api/v1/files/{id}", h.DeleteFile)
	mux.HandleFunc("DELETE /files/{id}", h.DeleteFile)

	// CDN Static delivery endpoints
	mux.HandleFunc("GET /files/{id}", h.DeliverFile)
	mux.HandleFunc("GET /files/{id}/{filename}", h.DeliverFile)
}

func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	s3Err := h.storage.Ping(ctx)

	status := "healthy"
	code := http.StatusOK
	if s3Err != nil {
		status = "degraded"
		code = http.StatusServiceUnavailable
	}

	writeJSON(w, code, map[string]any{
		"status": status,
		"s3":     s3Err == nil,
	})
}

func (h *Handler) UploadFiles(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(h.cfg.MaxUploadSize); err != nil {
		writeError(w, http.StatusBadRequest, "file exceeds maximum allowed size or invalid multipart: "+err.Error())
		return
	}

	// Gather file headers from "file" and "files" form keys
	var fileHeaders []*multipart.FileHeader
	if fhs, ok := r.MultipartForm.File["file"]; ok {
		fileHeaders = append(fileHeaders, fhs...)
	}
	if fhs, ok := r.MultipartForm.File["files"]; ok {
		fileHeaders = append(fileHeaders, fhs...)
	}

	if len(fileHeaders) == 0 {
		writeError(w, http.StatusBadRequest, "no files provided in 'file' or 'files' field")
		return
	}

	var results []model.FileUploadResult
	var ids []string
	ctx := r.Context()

	for _, header := range fileHeaders {
		contentType, err := validateAssetType(header.Filename, header.Header.Get("Content-Type"))
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid file %q: %v", header.Filename, err))
			return
		}

		file, err := header.Open()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read file: "+err.Error())
			return
		}

		tempFile, err := os.CreateTemp("", "cdn-upload-*")
		if err != nil {
			file.Close()
			writeError(w, http.StatusInternalServerError, "failed to create temp file: "+err.Error())
			return
		}

		fileSize, err := io.Copy(tempFile, file)
		file.Close()
		if err != nil {
			tempFile.Close()
			_ = os.Remove(tempFile.Name())
			writeError(w, http.StatusInternalServerError, "failed to process file: "+err.Error())
			return
		}

		if _, err := tempFile.Seek(0, io.SeekStart); err != nil {
			tempFile.Close()
			_ = os.Remove(tempFile.Name())
			writeError(w, http.StatusInternalServerError, "failed to rewind file: "+err.Error())
			return
		}

		fileID := uuid.New().String()
		sanitizedName := filepath.Base(header.Filename)
		s3Key := fmt.Sprintf("%s/%s", fileID, sanitizedName)

		meta := map[string]string{
			"filename": sanitizedName,
		}

		uploadErr := h.storage.Upload(ctx, s3Key, tempFile, fileSize, contentType, meta)
		tempFile.Close()
		_ = os.Remove(tempFile.Name())

		if uploadErr != nil {
			writeError(w, http.StatusInternalServerError, "failed to upload to S3: "+uploadErr.Error())
			return
		}

		staticURL := fmt.Sprintf("%s/files/%s/%s", h.cfg.CDNBaseURL, fileID, sanitizedName)
		results = append(results, model.FileUploadResult{
			ID:          fileID,
			Filename:    sanitizedName,
			ContentType: contentType,
			FileSize:    fileSize,
			URL:         staticURL,
		})
		ids = append(ids, fileID)
	}

	// Single file upload returns direct ID and URL
	if len(results) == 1 {
		writeJSON(w, http.StatusCreated, map[string]any{
			"id":       results[0].ID,
			"filename": results[0].Filename,
			"url":      results[0].URL,
		})
		return
	}

	// Multiple files upload
	writeJSON(w, http.StatusCreated, model.UploadResponse{
		IDs:   ids,
		Files: results,
	})
}

func (h *Handler) UpdateFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "file id required")
		return
	}

	if err := r.ParseMultipartForm(h.cfg.MaxUploadSize); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form: "+err.Error())
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file field required: "+err.Error())
		return
	}
	defer file.Close()

	contentType, err := validateAssetType(header.Filename, header.Header.Get("Content-Type"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	tempFile, err := os.CreateTemp("", "cdn-update-*")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create temp file: "+err.Error())
		return
	}
	defer func() {
		tempFile.Close()
		_ = os.Remove(tempFile.Name())
	}()

	fileSize, err := io.Copy(tempFile, file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read uploaded file: "+err.Error())
		return
	}

	if _, err := tempFile.Seek(0, io.SeekStart); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to rewind file: "+err.Error())
		return
	}

	ctx := r.Context()
	_ = h.storage.DeleteByID(ctx, id)

	sanitizedName := filepath.Base(header.Filename)
	s3Key := fmt.Sprintf("%s/%s", id, sanitizedName)
	meta := map[string]string{
		"filename": sanitizedName,
	}

	if err := h.storage.Upload(ctx, s3Key, tempFile, fileSize, contentType, meta); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to upload to S3: "+err.Error())
		return
	}

	staticURL := fmt.Sprintf("%s/files/%s/%s", h.cfg.CDNBaseURL, id, sanitizedName)
	writeJSON(w, http.StatusOK, map[string]any{
		"id":       id,
		"filename": sanitizedName,
		"url":      staticURL,
	})
}

func (h *Handler) DeleteFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "file id required")
		return
	}

	ctx := r.Context()
	if err := h.storage.DeleteByID(ctx, id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete file from S3: "+err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeliverFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	filename := r.PathValue("filename")

	if id == "" {
		writeError(w, http.StatusBadRequest, "file id required")
		return
	}

	ctx := r.Context()
	s3Key := ""
	if filename != "" {
		s3Key = fmt.Sprintf("%s/%s", id, filename)
	} else {
		foundKey, err := h.storage.FindKeyByID(ctx, id)
		if err != nil {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		s3Key = foundKey
	}

	rangeHeader := r.Header.Get("Range")
	obj, err := h.storage.Get(ctx, s3Key, rangeHeader)
	if err != nil {
		// If explicit filename was not found, attempt prefix lookup fallback
		if filename != "" {
			if foundKey, fErr := h.storage.FindKeyByID(ctx, id); fErr == nil {
				obj, err = h.storage.Get(ctx, foundKey, rangeHeader)
			}
		}
		if err != nil {
			writeError(w, http.StatusNotFound, "file not found: "+err.Error())
			return
		}
	}
	defer obj.Body.Close()

	// Cache validation
	if match := r.Header.Get("If-None-Match"); match != "" && obj.ETag != "" && (match == obj.ETag || match == fmt.Sprintf(`"%s"`, obj.ETag)) {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	contentType := obj.ContentType
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = mime.TypeByExtension(filepath.Ext(s3Key))
		if contentType == "" {
			contentType = "application/octet-stream"
		}
	}

	w.Header().Set("Content-Type", contentType)
	if obj.ETag != "" {
		w.Header().Set("ETag", obj.ETag)
	}
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if obj.ContentRange != "" {
		w.Header().Set("Content-Range", obj.ContentRange)
		w.WriteHeader(http.StatusPartialContent)
	} else {
		if obj.ContentLength > 0 {
			w.Header().Set("Content-Length", strconv.FormatInt(obj.ContentLength, 10))
		}
		w.WriteHeader(http.StatusOK)
	}

	_, _ = io.Copy(w, obj.Body)
}

func (h *Handler) ServeOpenAPISpec(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/yaml")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(api.OpenAPISpec)
}

func (h *Handler) ServeSwaggerUI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(swaggerHTML))
}

func validateAssetType(filename, headerContentType string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	// Video
	case ".mp4":
		return "video/mp4", nil
	// Script
	case ".js", ".mjs", ".cjs":
		return "application/javascript", nil
	// Docs: PDF
	case ".pdf":
		return "application/pdf", nil
	// Docs: Text
	case ".txt":
		return "text/plain; charset=utf-8", nil
	case ".md":
		return "text/markdown; charset=utf-8", nil
	case ".csv":
		return "text/csv; charset=utf-8", nil
	case ".json":
		return "application/json", nil
	case ".xml":
		return "application/xml", nil
	// Docs: Images
	case ".png":
		return "image/png", nil
	case ".jpg", ".jpeg":
		return "image/jpeg", nil
	case ".gif":
		return "image/gif", nil
	case ".webp":
		return "image/webp", nil
	case ".svg":
		return "image/svg+xml", nil
	case ".ico":
		return "image/x-icon", nil
	}

	// Fallback to header content type check
	hType := strings.ToLower(strings.TrimSpace(headerContentType))
	if hType != "" {
		if idx := strings.Index(hType, ";"); idx != -1 {
			hType = strings.TrimSpace(hType[:idx])
		}
		if hType == "video/mp4" ||
			hType == "application/javascript" || hType == "text/javascript" ||
			hType == "application/pdf" ||
			strings.HasPrefix(hType, "text/") ||
			strings.HasPrefix(hType, "image/") {
			return headerContentType, nil
		}
	}

	if ext != "" {
		if mimeType := mime.TypeByExtension(ext); mimeType != "" {
			if strings.HasPrefix(mimeType, "text/") || strings.HasPrefix(mimeType, "image/") {
				return mimeType, nil
			}
		}
	}

	return "", fmt.Errorf("unsupported file type: only video (mp4), code (js), or docs (pdf, text, images) are permitted (got filename: %s, mime: %s)", filename, headerContentType)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error": message,
	})
}

const swaggerHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CDN Service - Swagger API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/swagger/openapi.yaml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`
