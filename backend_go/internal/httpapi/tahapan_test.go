package httpapi

import "testing"

func TestTahapanIndex(t *testing.T) {
	cases := []struct {
		proposal, laporan string
		want              int
	}{
		{"draft", "", 0},
		{"review", "", 0},
		{"ditolak", "", 0},
		{"disetujui", "", 1},
		{"disetujui", "draft", 1},
		{"disetujui", "diajukan", 2},
		{"disetujui", "review", 2},
		{"disetujui", "revisi", 2},
		{"disetujui", "ditolak", 2},
		{"disetujui", "disetujui", 3},
		{"revisi", "disetujui", 0}, // proposal dikembalikan ke revisi: kembali ke tahap usulan
	}
	for _, tc := range cases {
		if got := tahapanIndex(tc.proposal, tc.laporan); got != tc.want {
			t.Errorf("tahapanIndex(%q, %q) = %d, want %d", tc.proposal, tc.laporan, got, tc.want)
		}
	}
}
