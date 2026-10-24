package config

import (
	"os"
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
			if tc.envVal != "" {
				t.Setenv("CDN_BASE_URL", tc.envVal)
			} else {
				os.Unsetenv("CDN_BASE_URL")
			}

			cfg := Load()
			if cfg.CDNBaseURL != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, cfg.CDNBaseURL)
			}
		})
	}
}
