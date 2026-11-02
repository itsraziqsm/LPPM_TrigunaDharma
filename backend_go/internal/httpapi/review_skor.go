package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"lppm-backend-go/internal/sqlb"
)

// Baru (W-54), tidak ada di Node: form penilaian reviewer. Skor 1–5 per komponen rubrik +
// catatan singkat (tabel ReviewSkor), dana disetujui per review proposal
// (ProposalReview.danaDisetujui), dan dana final kegiatan (Penelitian/Pengabdian.danaDisetujui)
// yang diisi saat review proposal difinalisasi. Satu proposal hanya punya satu reviewer.

type komponenRubrik struct{ kode, label string }

// rubrikReview sama untuk penelitian, pengabdian, dan laporan (mengikuti formulir LPPM).
var rubrikReview = []komponenRubrik{
	{"judul", "Kejelasan & fokus judul"},
	{"relevansi", "Relevansi topik"},
	{"latar", "Latar belakang & perumusan masalah"},
	{"kebaruan", "Research gap & kebaruan"},
	{"pustaka", "Tinjauan pustaka (mutakhir & relevan)"},
	{"konsistensi", "Konsistensi judul–latar–pustaka"},
	{"kelayakan", "Kelayakan pelaksanaan"},
}

func urutanRubrik(kode string) int {
	for i, k := range rubrikReview {
		if k.kode == kode {
			return i
		}
	}
	return -1
}

// GET /reviewer/rubrik (login).
func (s *Server) getRubrikReview(c *Ctx) error {
	out := make([]O, len(rubrikReview))
	for i, k := range rubrikReview {
		out[i] = O{{"kode", k.kode}, {"label", k.label}, {"urutan", int64(i + 1)}}
	}
	return c.ok("Rubrik review fetched", out)
}

type skorItem struct {
	kode    string
	skor    int64
	catatan any
}

// parseSkor memvalidasi body `skor: [{kode, skor, catatan?}]` (boleh sebagian saat simpan draf).
func parseSkor(raw any) ([]skorItem, error) {
	list, ok := raw.([]any)
	if !ok {
		return nil, httpError(http.StatusBadRequest, "skor harus berupa array [{kode, skor, catatan}]")
	}
	seen := map[string]bool{}
	out := make([]skorItem, 0, len(list))
	for i, v := range list {
		m, ok := v.(map[string]any)
		if !ok {
			return nil, httpError(http.StatusBadRequest, fmt.Sprintf("skor[%d] harus berupa objek", i))
		}
		kode, _ := m["kode"].(string)
		if urutanRubrik(kode) < 0 {
			return nil, httpError(http.StatusBadRequest, fmt.Sprintf("skor[%d].kode tidak dikenal", i))
		}
		if seen[kode] {
			return nil, httpError(http.StatusBadRequest, "Komponen "+kode+" dikirim lebih dari sekali")
		}
		seen[kode] = true
		n, ok := m["skor"].(float64)
		if !ok || n != math.Trunc(n) || n < 1 || n > 5 {
			return nil, httpError(http.StatusBadRequest, "Skor "+kode+" harus bilangan bulat 1–5")
		}
		var catatan any
		if cv, exists := m["catatan"]; exists && cv != nil {
			str, ok := cv.(string)
			if !ok {
				return nil, httpError(http.StatusBadRequest, "Catatan "+kode+" harus berupa teks")
			}
			str = strings.TrimSpace(str)
			if len([]rune(str)) > 200 {
				return nil, httpError(http.StatusBadRequest, "Catatan "+kode+" maksimal 200 karakter")
			}
			if str != "" {
				catatan = str
			}
		}
		out = append(out, skorItem{kode, int64(n), catatan})
	}
	return out, nil
}

// parseDana: angka ≥ 0 (atau string angka), null = kosongkan.
func parseDana(raw any) (any, *float64, error) {
	var f float64
	switch v := raw.(type) {
	case nil:
		return nil, nil, nil
	case float64:
		f = v
	case string:
		p, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err != nil {
			return nil, nil, httpError(http.StatusBadRequest, "danaDisetujui harus berupa angka")
		}
		f = p
	default:
		return nil, nil, httpError(http.StatusBadRequest, "danaDisetujui harus berupa angka")
	}
	if f < 0 || math.IsNaN(f) || math.IsInf(f, 0) {
		return nil, nil, httpError(http.StatusBadRequest, "danaDisetujui tidak boleh negatif")
	}
	f = math.Round(f*100) / 100
	return strconv.FormatFloat(f, 'f', 2, 64), &f, nil
}

// reviewTarget: data kegiatan yang direview (proposal: dana dicek terhadap anggaran).
type reviewTarget struct {
	proposal bool
	status   string
	anggaran sql.NullFloat64
}

func (s *Server) reviewTargetOf(ctx context.Context, id int64, proposal bool) (*reviewTarget, error) {
	t := &reviewTarget{proposal: proposal}
	q := "SELECT `status`, `anggaran` FROM `Laporan` WHERE `id` = ?"
	if proposal {
		q = "SELECT `status`, `anggaran` FROM `Proposal` WHERE `id` = ?"
	}
	err := s.db.QueryRowContext(ctx, q, id).Scan(&t.status, &t.anggaran)
	if errors.Is(err, sql.ErrNoRows) {
		return t, nil
	}
	return t, err
}

// reviewExtra memvalidasi `skor` & `danaDisetujui` dari body sebelum ada yang ditulis.
type reviewExtra struct {
	adaSkor bool
	skor    []skorItem
	adaDana bool
	dana    any
}

func parseReviewExtra(body map[string]any, t *reviewTarget) (*reviewExtra, error) {
	x := &reviewExtra{}
	if raw, ok := body["skor"]; ok && raw != nil {
		list, err := parseSkor(raw)
		if err != nil {
			return nil, err
		}
		x.adaSkor, x.skor = true, list
	}
	if raw, ok := body["danaDisetujui"]; ok {
		if !t.proposal {
			return nil, httpError(http.StatusBadRequest, "danaDisetujui hanya untuk review proposal")
		}
		if t.status == "disetujui" || t.status == "ditolak" {
			return nil, httpError(http.StatusBadRequest, "Proposal sudah diputuskan; dana disetujui tidak dapat diubah")
		}
		val, f, err := parseDana(raw)
		if err != nil {
			return nil, err
		}
		if f != nil && t.anggaran.Valid && *f > t.anggaran.Float64 {
			return nil, httpError(http.StatusBadRequest, "Dana disetujui tidak boleh melebihi dana yang diusulkan")
		}
		x.adaDana, x.dana = true, val
	}
	return x, nil
}

// simpanSkor mengganti seluruh skor milik review.
func simpanSkor(ctx context.Context, tx *sql.Tx, reviewID int64, list []skorItem) error {
	if _, err := tx.ExecContext(ctx, "DELETE FROM `ReviewSkor` WHERE `reviewId` = ?", reviewID); err != nil {
		return err
	}
	if len(list) == 0 {
		return nil
	}
	args := make([]any, 0, len(list)*4)
	for _, it := range list {
		args = append(args, reviewID, it.kode, it.skor, it.catatan)
	}
	_, err := tx.ExecContext(ctx, sqlb.InsertIgnoreRows("ReviewSkor", []string{"reviewId", "kode", "skor", "catatan"}, len(list)), args...)
	return err
}

// lengkapiReview menambah skor, totalSkor, rataSkor, danaDisetujui ke tiap objek review (kunci "id").
func lengkapiReview(ctx context.Context, q dbtx, reviews []O) error {
	ids := uniqueIDs(reviews, "id")
	if len(ids) == 0 {
		return nil
	}
	rows, err := queryObjs(ctx, q, sqlb.In("SELECT `reviewId`,`kode`,CAST(`skor` AS SIGNED) AS `skor`,`catatan` FROM `ReviewSkor` WHERE `reviewId` IN (?*)", len(ids)), idArgs(ids)...)
	if err != nil {
		return err
	}
	danaRows, err := queryObjs(ctx, q, sqlb.In("SELECT `id`,`danaDisetujui` FROM `ProposalReview` WHERE `id` IN (?*)", len(ids)), idArgs(ids)...)
	if err != nil {
		return err
	}
	skor := map[int64][]O{}
	for _, r := range rows {
		skor[r.Int64("reviewId")] = append(skor[r.Int64("reviewId")], O{{"kode", r.Get("kode")}, {"skor", r.Int64("skor")}, {"catatan", r.Get("catatan")}})
	}
	dana := map[int64]any{}
	for _, r := range danaRows {
		dana[r.Int64("id")] = r.Get("danaDisetujui")
	}
	for i, r := range reviews {
		reviews[i] = denganNilai(r, skor[r.Int64("id")], dana[r.Int64("id")])
	}
	return nil
}

// denganNilai mengembalikan review + skor (urut rubrik), totalSkor, rataSkor, danaDisetujui.
func denganNilai(review O, list []O, dana any) O {
	if list == nil {
		list = []O{}
	}
	sortSkor(list)
	var total int64
	for _, it := range list {
		total += it.Int64("skor")
	}
	var rata any
	if len(list) > 0 {
		rata = math.Round(float64(total)/float64(len(list))*100) / 100
	}
	review.Set("skor", list)
	review.Set("totalSkor", total)
	review.Set("rataSkor", rata)
	review.Set("danaDisetujui", dana)
	return review
}

func sortSkor(list []O) {
	for i := 1; i < len(list); i++ {
		for j := i; j > 0 && urutanRubrik(list[j].Str("kode")) < urutanRubrik(list[j-1].Str("kode")); j-- {
			list[j], list[j-1] = list[j-1], list[j]
		}
	}
}

// lengkapiSatuReview: lengkapiReview untuk satu objek (nil dibiarkan).
func lengkapiSatuReview(ctx context.Context, q dbtx, review O) (O, error) {
	if review == nil {
		return nil, nil
	}
	list := []O{review}
	if err := lengkapiReview(ctx, q, list); err != nil {
		return nil, err
	}
	return list[0], nil
}

// cekReviewLengkap dipakai saat finalisasi: semua komponen rubrik terisi, rekomendasi ada, dan
// (proposal) dana disetujui ada — rekomendasi ditolak mengisi dana 0 otomatis. Mengembalikan
// dana final untuk proposal.
func (s *Server) cekReviewLengkap(ctx context.Context, reviewID int64, t *reviewTarget) (any, error) {
	var rekomendasi sql.NullString
	var dana sql.NullString
	if err := s.db.QueryRowContext(ctx, "SELECT `rekomendasi`,`danaDisetujui` FROM `ProposalReview` WHERE `id` = ?", reviewID).Scan(&rekomendasi, &dana); err != nil {
		return nil, err
	}
	n, err := countRows(ctx, s.db, "SELECT COUNT(*) FROM `ReviewSkor` WHERE `reviewId` = ?", reviewID)
	if err != nil {
		return nil, err
	}
	if n < int64(len(rubrikReview)) {
		return nil, httpError(http.StatusBadRequest, fmt.Sprintf("Skor belum lengkap: %d dari %d komponen terisi", n, len(rubrikReview)))
	}
	if !rekomendasi.Valid || rekomendasi.String == "" {
		return nil, httpError(http.StatusBadRequest, "Rekomendasi wajib dipilih sebelum review diselesaikan")
	}
	if !t.proposal {
		return nil, nil
	}
	if rekomendasi.String == "ditolak" {
		return "0.00", nil
	}
	if !dana.Valid {
		return nil, httpError(http.StatusBadRequest, "Dana disetujui wajib diisi sebelum review proposal diselesaikan")
	}
	return dana.String, nil
}
