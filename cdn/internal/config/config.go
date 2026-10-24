package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port           string
	S3Endpoint     string
	S3Region       string
	S3Bucket       string
	S3AccessKey    string
	S3SecretKey    string
	S3UsePathStyle bool
	CDNBaseURL     string
	MaxUploadSize  int64
}

func Load() *Config {
	port := getEnv("PORT", "8080")
	s3Endpoint := getEnv("S3_ENDPOINT", "http://localhost:9000")
	s3Region := getEnv("S3_REGION", "us-east-1")
	s3Bucket := getEnv("S3_BUCKET", "braingain")
	s3AccessKey := getEnv("S3_ACCESS_KEY_ID", "braingain")
	s3SecretKey := getEnv("S3_SECRET_ACCESS_KEY", "braingain-secret")
	s3UsePathStyle := getEnvBool("S3_USE_PATH_STYLE", true)
	cdnBaseURL := strings.TrimRight(getEnv("CDN_BASE_URL", "http://localhost:"+port), "/")

	maxUploadMB, err := strconv.ParseInt(getEnv("MAX_UPLOAD_SIZE_MB", "500"), 10, 64)
	if err != nil || maxUploadMB <= 0 {
		maxUploadMB = 500
	}

	return &Config{
		Port:           port,
		S3Endpoint:     s3Endpoint,
		S3Region:       s3Region,
		S3Bucket:       s3Bucket,
		S3AccessKey:    s3AccessKey,
		S3SecretKey:    s3SecretKey,
		S3UsePathStyle: s3UsePathStyle,
		CDNBaseURL:     cdnBaseURL,
		MaxUploadSize:  maxUploadMB * 1024 * 1024,
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	parsed, err := strconv.ParseBool(val)
	if err != nil {
		return defaultVal
	}
	return parsed
}
