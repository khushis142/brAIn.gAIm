package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/brAIn-gAIm/CDN/internal/config"
	"github.com/brAIn-gAIm/CDN/internal/handler"
	"github.com/brAIn-gAIm/CDN/internal/storage"
)

func main() {
	cfg := config.Load()
	log.Printf("[CDN] Starting server on port :%s", cfg.Port)
	log.Printf("[CDN] S3 Endpoint: %s (Bucket: %s, PathStyle: %v)", cfg.S3Endpoint, cfg.S3Bucket, cfg.S3UsePathStyle)

	// S3 / RustFS
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	s3Store, err := storage.New(ctx, cfg)
	if err != nil {
		log.Fatalf("[CDN] S3/RustFS storage initialization failed: %v", err)
	}
	log.Printf("[CDN] Storage connected to bucket: %s", cfg.S3Bucket)

	// Router
	mux := http.NewServeMux()
	h := handler.New(cfg, s3Store)
	h.RegisterRoutes(mux)

	// Top-level middleware: CORS, logging, recovery
	srvHandler := withCORS(withLogging(withRecovery(mux)))

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      srvHandler,
		ReadTimeout:  30 * time.Minute,
		WriteTimeout: 30 * time.Minute,
		IdleTimeout:  60 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[CDN] Server failed: %v", err)
		}
	}()
	log.Printf("[CDN] Server ready to receive requests at http://localhost:%s", cfg.Port)

	<-stop
	log.Printf("[CDN] Shutting down gracefully...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[CDN] Shutdown error: %v", err)
	}
	log.Printf("[CDN] Server stopped")
}

func withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("[CDN] Panic recovered: %v", rec)
				http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Range, If-None-Match")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, ETag, Accept-Ranges")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
