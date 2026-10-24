package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL       string
	Port              string
	NodeEnv           string
	CORSOrigin        string
	TrustProxy        bool
	JWTAccessSecret   string
	JWTRefreshSecret  string
	JWTAccessExpiry   string
	JWTRefreshExpiry  string
	RateLimitWindowMS int
	RateLimitMax      int
	SMTPHost          string
	SMTPPort          string
	SMTPSecure        bool
	SMTPUser          string
	SMTPPass          string
	AppName           string
	FrontendURL       string
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		Port:             envOr("PORT", "3000"),
		NodeEnv:          envOr("NODE_ENV", "development"),
		CORSOrigin:       envOr("CORS_ORIGIN", "*"),
		TrustProxy:       os.Getenv("TRUST_PROXY") == "true",
		JWTAccessSecret:  os.Getenv("JWT_ACCESS_SECRET"),
		JWTRefreshSecret: os.Getenv("JWT_REFRESH_SECRET"),
		JWTAccessExpiry:  envOr("JWT_ACCESS_EXPIRES_IN", "15m"),
		JWTRefreshExpiry: envOr("JWT_REFRESH_EXPIRES_IN", "30d"),
		RateLimitWindowMS: envPositiveInt(
			"RATE_LIMIT_WINDOW_MS", 15*60*1000,
		),
		RateLimitMax: envPositiveInt("RATE_LIMIT_MAX", 500),
		SMTPHost:     os.Getenv("SMTP_HOST"),
		SMTPPort:     envOr("SMTP_PORT", "587"),
		SMTPSecure:   os.Getenv("SMTP_SECURE") == "true",
		SMTPUser:     os.Getenv("SMTP_USER"),
		SMTPPass:     os.Getenv("SMTP_PASS"),
		AppName:      envOr("APP_NAME", "LPPM App"),
		FrontendURL:  os.Getenv("FRONTEND_URL"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("missing required environment variable: DATABASE_URL")
	}
	if cfg.JWTAccessSecret == "" {
		return Config{}, fmt.Errorf("missing required environment variable: JWT_ACCESS_SECRET")
	}
	if cfg.JWTRefreshSecret == "" {
		return Config{}, fmt.Errorf("missing required environment variable: JWT_REFRESH_SECRET")
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envPositiveInt(key string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(key))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
