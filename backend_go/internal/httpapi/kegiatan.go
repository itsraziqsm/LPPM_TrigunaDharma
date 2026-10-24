package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

// Tabel `Proposal` dipecah menjadi tabel fisik `Penelitian` dan `Pengabdian`
// (migrasi 20261024000000_split_proposal_penelitian_pengabdian). Id setiap
// baris berasal dari registri `Kegiatan` sehingga unik di kedua tabel.
//
// Baca: lewat VIEW `Proposal` (tipe 'proposal') dan VIEW `Laporan`
// (tipe 'laporan'). Tulis: helper di file ini, yang memilih tabel fisik
// berdasarkan `Kegiatan.jenis`.

const (
	tipeProposal = "proposal"
	tipeLaporan  = "laporan"
)

// kegiatanTable maps jenis → physical table.
var kegiatanTable = map[string]string{
	"penelitian": "Penelitian",
	"pengabdian": "Pengabdian",
}

// kegiatanColumns are the physical columns shared by Penelitian/Pengabdian
// (used when a row moves to the other table; skema/mitra are table-specific).
const kegiatanColumns = "`id`,`tipe`,`proposalId`,`judul`,`abstrak`,`status`,`anggaran`,`luaran`,`rumpunIlmu`,`bidang`,`kataKunci`,`luaranTercapai`,`ringkasanHasil`,`realisasiAnggaran`,`catatanRevisi`,`pengusulId`,`periodeId`," +
	"`dokumenUrl`,`dokumenNama`,`dokumenMime`,`dokumenUkuran`,`dokumenBlob`,`submittedAt`,`approvedAt`,`createdAt`,`updatedAt`"

type kegiatanRef struct {
	ID    int64
	Jenis string
	Tipe  string
}

func (k *kegiatanRef) table() string { return kegiatanTable[k.Jenis] }

// kegiatanByID reads the registry row; nil when the id does not exist.
func (s *Server) kegiatanByID(ctx context.Context, q dbtx, id int64) (*kegiatanRef, error) {
	k := kegiatanRef{ID: id}
	err := q.QueryRowContext(ctx, "SELECT `jenis`,`tipe` FROM `Kegiatan` WHERE `id` = ?", id).Scan(&k.Jenis, &k.Tipe)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &k, nil
}

// insertKegiatan registers a new id and inserts the row into the physical
// table of its jenis. cols/args must not contain id, tipe or jenis.
func (s *Server) insertKegiatan(ctx context.Context, tx dbtx, jenis, tipe string, cols []string, args []any) (int64, error) {
	table, ok := kegiatanTable[jenis]
	if !ok {
		return 0, plainError("Jenis kegiatan tidak valid: " + jenis)
	}
	res, err := tx.ExecContext(ctx, "INSERT INTO `Kegiatan` (`jenis`,`tipe`,`createdAt`) VALUES (?,?,?)", jenis, tipe, s.nowMs())
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	quoted := make([]string, 0, len(cols)+2)
	quoted = append(quoted, "`id`", "`tipe`")
	for _, col := range cols {
		quoted = append(quoted, "`"+col+"`")
	}
	values := append([]any{id, tipe}, args...)
	if _, err := tx.ExecContext(ctx, "INSERT INTO `"+table+"` ("+strings.Join(quoted, ",")+") VALUES ("+placeholders(len(values))+")", values...); err != nil {
		return 0, err
	}
	return id, nil
}

// updateKegiatan runs `UPDATE <tabel fisik> SET <sets> WHERE id = ?`.
// A missing id is a no-op, like UPDATE on the old table.
func (s *Server) updateKegiatan(ctx context.Context, q dbtx, id int64, sets string, args ...any) error {
	k, err := s.kegiatanByID(ctx, q, id)
	if err != nil || k == nil {
		return err
	}
	_, err = q.ExecContext(ctx, "UPDATE `"+k.table()+"` SET "+sets+" WHERE `id` = ?", append(args, id)...)
	return err
}

// deleteKegiatan removes the registry row; the physical row and every
// relation (anggota, tugasan, review, laporan, dokumen, laporan harian,
// laporan turunan) follow through ON DELETE CASCADE.
func (s *Server) deleteKegiatan(ctx context.Context, q dbtx, id int64) error {
	_, err := q.ExecContext(ctx, "DELETE FROM `Kegiatan` WHERE `id` = ?", id)
	return err
}

// moveKegiatanJenis moves a row to the other physical table when its jenis
// changes (PATCH proposal with a new `jenis`), keeping the same id.
func (s *Server) moveKegiatanJenis(ctx context.Context, tx dbtx, k *kegiatanRef, jenis string) error {
	target, ok := kegiatanTable[jenis]
	if !ok || jenis == k.Jenis {
		return nil
	}
	hasLaporan, err := countRows(ctx, tx, "SELECT COUNT(*) FROM `Laporan` WHERE `proposalId` = ?", k.ID)
	if err != nil {
		return err
	}
	if hasLaporan > 0 {
		return plainError("Jenis proposal tidak dapat diubah karena proposal sudah memiliki laporan")
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO `"+target+"` ("+kegiatanColumns+") SELECT "+kegiatanColumns+" FROM `"+k.table()+"` WHERE `id` = ?", k.ID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM `"+k.table()+"` WHERE `id` = ?", k.ID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE `Kegiatan` SET `jenis` = ? WHERE `id` = ?", jenis, k.ID); err != nil {
		return err
	}
	k.Jenis = jenis
	return nil
}

// kegiatanFile reads the main document stored in the physical table.
func (s *Server) kegiatanFile(ctx context.Context, id int64) (storedFile, bool, error) {
	var f storedFile
	k, err := s.kegiatanByID(ctx, s.db, id)
	if err != nil || k == nil {
		return f, false, err
	}
	err = s.db.QueryRowContext(ctx, "SELECT `dokumenBlob`,`dokumenMime`,`dokumenNama`,`dokumenUkuran` FROM `"+k.table()+"` WHERE `id` = ?", id).
		Scan(&f.blob, &f.mime, &f.name, &f.size)
	if errors.Is(err, sql.ErrNoRows) {
		return f, false, nil
	}
	return f, err == nil, err
}
