package database

import (
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"

	mysql "github.com/go-sql-driver/mysql"
)

func Open(databaseURL string) (*sql.DB, error) {
	dsn, err := toDSN(databaseURL)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}
	db.SetMaxOpenConns(50)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("connect mysql: %w", err)
	}
	return db, nil
}

func toDSN(raw string) (string, error) {
	if !strings.HasPrefix(raw, "mysql://") {
		cfg, err := mysql.ParseDSN(raw)
		if err != nil {
			return "", fmt.Errorf("invalid DATABASE_URL: %w", err)
		}
		cfg.ParseTime = true
		return cfg.FormatDSN(), nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("invalid DATABASE_URL: %w", err)
	}
	if u.Hostname() == "" || strings.TrimPrefix(u.Path, "/") == "" {
		return "", fmt.Errorf("invalid DATABASE_URL: host and database are required")
	}
	port := u.Port()
	if port == "" {
		port = "3306"
	}
	cfg := mysql.NewConfig()
	if u.User != nil {
		cfg.User = u.User.Username()
		cfg.Passwd, _ = u.User.Password()
	}
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(u.Hostname(), port)
	cfg.DBName = strings.TrimPrefix(u.Path, "/")
	cfg.ParseTime = true
	cfg.Loc = time.Local
	cfg.Timeout = 5 * time.Second
	cfg.ReadTimeout = 30 * time.Second
	cfg.WriteTimeout = 30 * time.Second
	cfg.Params = map[string]string{"charset": "utf8mb4"}
	for key, values := range u.Query() {
		if len(values) > 0 {
			cfg.Params[key] = values[len(values)-1]
		}
	}
	return cfg.FormatDSN(), nil
}
