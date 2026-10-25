package httpapi

import (
	"strings"
	"testing"
	"time"

	"lppm-backend-go/internal/config"
)

func TestWriteSQLValue(t *testing.T) {
	cases := []struct {
		typ  string
		v    any
		want string
	}{
		{"VARCHAR", nil, "NULL"},
		{"VARCHAR", []byte("O'Brien\\\n\x00"), `'O\'Brien\\\n\0'`},
		{"INT", int64(-5), "-5"},
		{"DECIMAL", []byte("1500000.50"), "1500000.50"},
		{"LONGBLOB", []byte{0x25, 0x50}, "0x2550"},
		{"LONGBLOB", []byte{}, "''"},
		{"DATETIME", time.Date(2026, 5, 16, 4, 53, 59, 123000000, time.UTC), "'2026-05-16 04:53:59.123000'"},
	}
	for _, c := range cases {
		var b strings.Builder
		writeSQLValue(&b, c.typ, c.v)
		if b.String() != c.want {
			t.Errorf("%s %v: got %s want %s", c.typ, c.v, b.String(), c.want)
		}
	}
}

func TestDefinerStripped(t *testing.T) {
	in := "CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`%` SQL SECURITY DEFINER VIEW `Proposal` AS select 1"
	if got := definerRe.ReplaceAllString(in, ""); got != "CREATE ALGORITHM=UNDEFINED VIEW `Proposal` AS select 1" {
		t.Fatal(got)
	}
}

func TestJadwalBulanIni(t *testing.T) {
	s := &Server{cfg: config.Config{BackupHari: 1, BackupJam: 2, BackupZona: "Asia/Jakarta"}}
	// 31 Okt 20:00 UTC = 1 Nov 03:00 WIB → jadwal bulan November, sudah lewat.
	now := time.Date(2026, 10, 31, 20, 0, 0, 0, time.UTC)
	j := s.jadwalBulanIni(now)
	if j.UTC() != time.Date(2026, 10, 31, 19, 0, 0, 0, time.UTC) || now.Before(j) {
		t.Fatal(j.UTC())
	}
}
