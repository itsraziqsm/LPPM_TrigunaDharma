package config

import "testing"

func TestLoadRequiresDatabaseAndJWTSecrets(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("JWT_ACCESS_SECRET", "")
	t.Setenv("JWT_REFRESH_SECRET", "")

	if _, err := Load(); err == nil {
		t.Fatal("Load() expected an error for missing required environment variables")
	}
}

func TestLoadDefaultsAndPositiveRateLimits(t *testing.T) {
	t.Setenv("DATABASE_URL", "user:pass@tcp(localhost:3306)/lppm")
	t.Setenv("JWT_ACCESS_SECRET", "access")
	t.Setenv("JWT_REFRESH_SECRET", "refresh")
	t.Setenv("PORT", "")
	t.Setenv("RATE_LIMIT_WINDOW_MS", "0")
	t.Setenv("RATE_LIMIT_MAX", "invalid")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if cfg.Port != "3000" || cfg.RateLimitWindowMS != 900000 || cfg.RateLimitMax != 500 {
		t.Fatalf("unexpected defaults: %#v", cfg)
	}
}
