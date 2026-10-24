package database

import (
	"strings"
	"testing"

	mysql "github.com/go-sql-driver/mysql"
)

func TestToDSNDecodesMySQLURLCredentials(t *testing.T) {
	dsn, err := toDSN("mysql://user:p%40ss%23word@db.example:3307/lppm?tls=false")
	if err != nil {
		t.Fatalf("toDSN(): %v", err)
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		t.Fatalf("parse DSN: %v", err)
	}
	if cfg.User != "user" || cfg.Passwd != "p@ss#word" || cfg.Addr != "db.example:3307" || cfg.DBName != "lppm" {
		t.Fatalf("unexpected parsed DSN: %#v", cfg)
	}
	if !cfg.ParseTime {
		t.Fatal("ParseTime is false")
	}
}

func TestToDSNAcceptsNativeMySQLDSN(t *testing.T) {
	dsn, err := toDSN("user:pass@tcp(localhost:3306)/lppm")
	if err != nil {
		t.Fatalf("toDSN(): %v", err)
	}
	if !strings.Contains(dsn, "parseTime=true") {
		t.Fatalf("DSN does not enable time parsing: %s", dsn)
	}
}

func TestToDSNRejectsMalformedURL(t *testing.T) {
	if _, err := toDSN("mysql://localhost"); err == nil {
		t.Fatal("toDSN() expected an error for a URL without a database")
	}
}
