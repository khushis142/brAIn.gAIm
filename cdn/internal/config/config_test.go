package config

import (
	"testing"
)

func TestLoadCDNBaseURL(t *testing.T) {
	tests := []struct {
		name     string
		envVal   string
		expected string
	}{
		{
			name:     "default value",
			envVal:   "",
			expected: "http://localhost:8080",
		},
		{
			name:     "with http scheme and trailing slash",
			envVal:   "http://192.168.188.67:8081/",
			expected: "http://192.168.188.67:8081",
		},
		{
			name:     "without scheme",
			envVal:   "192.168.188.67:8081",
			expected: "http://192.168.188.67:8081",
		},
		{
			name:     "with https scheme",
			envVal:   "https://cdn.example.com",
			expected: "https://cdn.example.com",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("CDN_BASE_URL", tc.envVal)

			cfg := Load()
			if cfg.CDNBaseURL != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, cfg.CDNBaseURL)
			}
		})
	}
}

func TestLoadTLSConfig(t *testing.T) {
	t.Run("defaults", func(t *testing.T) {
		cfg := Load()
		if !cfg.TLSEnabled {
			t.Errorf("expected TLSEnabled to default to true, got false")
		}
		if cfg.TLSPort != "8443" {
			t.Errorf("expected default TLSPort 8443, got %q", cfg.TLSPort)
		}
	})

	t.Run("explicitly disabled", func(t *testing.T) {
		t.Setenv("TLS_ENABLED", "false")
		cfg := Load()
		if cfg.TLSEnabled {
			t.Errorf("expected TLSEnabled to be false, got true")
		}
	})

	t.Run("custom cert and port", func(t *testing.T) {
		t.Setenv("TLS_PORT", "9443")
		t.Setenv("TLS_CERT_FILE", "/path/to/cert.pem")
		t.Setenv("TLS_KEY_FILE", "/path/to/key.pem")

		cfg := Load()
		if cfg.TLSPort != "9443" {
			t.Errorf("expected TLSPort 9443, got %q", cfg.TLSPort)
		}
		if cfg.TLSCertFile != "/path/to/cert.pem" {
			t.Errorf("expected cert file /path/to/cert.pem, got %q", cfg.TLSCertFile)
		}
		if cfg.TLSKeyFile != "/path/to/key.pem" {
			t.Errorf("expected key file /path/to/key.pem, got %q", cfg.TLSKeyFile)
		}
	})
}
