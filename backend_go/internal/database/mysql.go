package database

import (
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	mysql "github.com/go-sql-driver/mysql"
)

// Open connects to MySQL/MariaDB using the same DATABASE_URL as Prisma.
func Open(databaseURL string) (*sql.DB, error) {
	dsn, err := toDSN(databaseURL)
	if err != nil {
		return nil, err
	}
	return openDSN(dsn)
}

// OpenMultiStatements is Open with multiStatements enabled (used by the
// migration command to run whole migration.sql files).
func OpenMultiStatements(databaseURL string) (*sql.DB, error) {
	dsn, err := toDSN(databaseURL)
	if err != nil {
		return nil, err
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		return nil, err
	}
	cfg.MultiStatements = true
	return openDSN(cfg.FormatDSN())
}

func openDSN(dsn string) (*sql.DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("connect mysql: %w", err)
	}
	return db, nil
}

// decodeLenient percent-decodes a URL component; when the component is not
// valid percent-encoding (e.g. a raw "%" in a password) it is used as-is.
func decodeLenient(s string) string {
	if decoded, err := url.PathUnescape(s); err == nil {
		return decoded
	}
	return s
}

// toDSN converts a Prisma-style "mysql://user:pass@host:port/db?params"
// URL into a go-sql-driver DSN. Like Prisma, DateTime values are stored in
// UTC, so the connection uses UTC for both the driver and the session.
// Passwords containing unencoded special characters (@ # $ % !) are
// accepted: the host part starts after the LAST "@".
func toDSN(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "mysql://") && !strings.HasPrefix(raw, "mariadb://") {
		cfg, err := mysql.ParseDSN(raw)
		if err != nil {
			return "", fmt.Errorf("invalid DATABASE_URL: %w", err)
		}
		applyDefaults(cfg)
		return cfg.FormatDSN(), nil
	}
	rest := raw[strings.Index(raw, "://")+3:]

	// split off the query string (after the database path)
	query := ""
	at := strings.LastIndex(rest, "@")
	hostAndPath := rest
	userInfo := ""
	if at >= 0 {
		userInfo, hostAndPath = rest[:at], rest[at+1:]
	}
	if q := strings.Index(hostAndPath, "?"); q >= 0 {
		hostAndPath, query = hostAndPath[:q], hostAndPath[q+1:]
	}
	slash := strings.Index(hostAndPath, "/")
	if slash < 0 {
		return "", fmt.Errorf("invalid DATABASE_URL: database name is required")
	}
	hostPort, dbName := hostAndPath[:slash], decodeLenient(hostAndPath[slash+1:])
	if hostPort == "" || dbName == "" {
		return "", fmt.Errorf("invalid DATABASE_URL: host and database are required")
	}
	host, port := hostPort, "3306"
	if h, p, err := net.SplitHostPort(hostPort); err == nil {
		host, port = h, p
	}

	cfg := mysql.NewConfig()
	if userInfo != "" {
		user, pass, _ := strings.Cut(userInfo, ":")
		cfg.User = decodeLenient(user)
		cfg.Passwd = decodeLenient(pass)
	}
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(host, port)
	cfg.DBName = dbName
	cfg.Timeout = 10 * time.Second
	values, _ := url.ParseQuery(query)
	for key, list := range values {
		if len(list) == 0 {
			continue
		}
		value := list[len(list)-1]
		switch key {
		case "connect_timeout":
			if n, err := strconv.Atoi(value); err == nil && n > 0 {
				cfg.Timeout = time.Duration(n) * time.Second
			}
		case "socket_timeout":
			if n, err := strconv.Atoi(value); err == nil && n > 0 {
				cfg.ReadTimeout = time.Duration(n) * time.Second
				cfg.WriteTimeout = time.Duration(n) * time.Second
			}
		case "sslaccept":
			if value == "accept_invalid_certs" {
				cfg.TLSConfig = "skip-verify"
			} else {
				cfg.TLSConfig = "true"
			}
		case "tls":
			cfg.TLSConfig = value
		case "socket":
			cfg.Net, cfg.Addr = "unix", value
		}
		// other Prisma options (connection_limit, pool_timeout, sslcert...)
		// have no meaning for this driver and are ignored.
	}
	applyDefaults(cfg)
	return cfg.FormatDSN(), nil
}

func applyDefaults(cfg *mysql.Config) {
	cfg.ParseTime = true
	cfg.Loc = time.UTC
	if cfg.Params == nil {
		cfg.Params = map[string]string{}
	}
	cfg.Params["charset"] = "utf8mb4"
	cfg.Params["time_zone"] = "'+00:00'"
}
