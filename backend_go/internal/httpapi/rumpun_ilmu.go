package httpapi

import (
	"context"
	"net/http"
	"strings"
)

// Rumpun ilmu hanya dari master aktif (bidang komputer, migrasi 20261105000000). Dicek saat
// rumpunIlmu dikirim pada proposal (buat/ubah) dan laporan (buat/ubah); "" mengosongkan.
// Nilai lama di data yang sudah ada tidak diubah.
func (s *Server) checkRumpunIlmu(ctx context.Context, q dbtx, body map[string]any) error {
	raw, ok := body["rumpunIlmu"]
	if !ok {
		return nil
	}
	v, _ := raw.(string)
	v = strings.TrimSpace(v)
	if v == "" {
		body["rumpunIlmu"] = nil
		return nil
	}
	n, err := countRows(ctx, q, "SELECT COUNT(*) FROM `MasterData` WHERE `kategori` = 'rumpun_ilmu' AND `isAktif` = true AND `nama` = ?", v)
	if err != nil {
		return err
	}
	if n == 0 {
		return httpError(http.StatusBadRequest, `Rumpun ilmu "`+v+`" tidak tersedia. Pilih dari daftar rumpun ilmu bidang komputer (GET /master/rumpun-ilmu).`)
	}
	body["rumpunIlmu"] = v
	return nil
}
