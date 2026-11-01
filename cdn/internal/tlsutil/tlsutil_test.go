package tlsutil

import (
	"crypto/tls"
	"crypto/x509"
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateSelfSignedCert(t *testing.T) {
	cert, err := GenerateSelfSignedCert()
	if err != nil {
		t.Fatalf("GenerateSelfSignedCert failed: %v", err)
	}

	if len(cert.Certificate) == 0 {
		t.Fatal("expected certificate bytes, got empty")
	}

	parsed, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		t.Fatalf("failed to parse generated certificate: %v", err)
	}

	if parsed.Subject.CommonName != "localhost" {
		t.Errorf("expected CommonName 'localhost', got %q", parsed.Subject.CommonName)
	}
}

func TestLoadTLSConfig_AutoCert(t *testing.T) {
	cfg, err := LoadTLSConfig("", "")
	if err != nil {
		t.Fatalf("LoadTLSConfig failed: %v", err)
	}

	if cfg.MinVersion != tls.VersionTLS12 {
		t.Errorf("expected MinVersion TLS 1.2, got %x", cfg.MinVersion)
	}
	if len(cfg.Certificates) == 0 {
		t.Fatal("expected certificates in tls config")
	}
}

func TestLoadTLSConfig_InvalidFiles(t *testing.T) {
	tmpDir := t.TempDir()
	certFile := filepath.Join(tmpDir, "missing-cert.pem")
	keyFile := filepath.Join(tmpDir, "missing-key.pem")

	_, err := LoadTLSConfig(certFile, keyFile)
	if err == nil {
		t.Fatal("expected error loading nonexistent key pair, got nil")
	}

	// Invalid content
	_ = os.WriteFile(certFile, []byte("invalid cert"), 0600)
	_ = os.WriteFile(keyFile, []byte("invalid key"), 0600)
	_, err = LoadTLSConfig(certFile, keyFile)
	if err == nil {
		t.Fatal("expected error loading invalid key pair, got nil")
	}
}
