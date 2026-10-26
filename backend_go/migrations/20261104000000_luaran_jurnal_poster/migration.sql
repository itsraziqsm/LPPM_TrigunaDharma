-- Luaran prioritas: jurnal dan poster. Jenis luaran baru `poster` (ditambahkan di akhir ENUM agar
-- nilai lama tidak berubah) + pilihan master poster. Urutan prioritas (jurnal, poster lebih dulu)
-- diterapkan di query GET /master/luaran dan GET /luaran/jenis.
ALTER TABLE `LuaranKegiatan`
  MODIFY COLUMN `jenis` ENUM('jurnal', 'prosiding', 'hki', 'buku', 'produk', 'media_massa', 'lainnya', 'poster') NOT NULL;

ALTER TABLE `MasterData`
  MODIFY COLUMN `jenisLuaran` ENUM('jurnal', 'prosiding', 'hki', 'buku', 'produk', 'media_massa', 'lainnya', 'poster') NULL;

INSERT IGNORE INTO `MasterData` (`kategori`, `nama`, `jenisKegiatan`, `jenisLuaran`, `urutan`, `isAktif`, `createdAt`, `updatedAt`) VALUES
  ('luaran', 'Poster ilmiah (seminar / pameran)', NULL, 'poster', 3, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('luaran', 'Poster hasil kegiatan pengabdian', 'pengabdian', 'poster', 4, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
