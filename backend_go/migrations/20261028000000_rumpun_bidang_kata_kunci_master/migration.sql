-- W-22 sampai W-25 daftar waiting API (docs/waitingApi-list.md):
--   W-22  `rumpunIlmu` dan `bidang` di Penelitian/Pengabdian + master datanya
--   W-24  `kataKunci` (array teks, disimpan sebagai JSON di kolom TEXT)
--   W-25  master jenis luaran (dipetakan ke `LuaranKegiatan.jenis`)
--   W-23  (kontak anggota di pencarian) tidak butuh perubahan skema.
-- Nilai proposal tetap teks bebas (tidak ber-FK ke master), seperti programStudi.

-- 1) Kolom baru di kedua tabel kegiatan -------------------------------------------------
ALTER TABLE `Penelitian`
  ADD COLUMN `rumpunIlmu` VARCHAR(191) NULL AFTER `skema`,
  ADD COLUMN `bidang` VARCHAR(191) NULL AFTER `rumpunIlmu`,
  ADD COLUMN `kataKunci` TEXT NULL AFTER `bidang`;
ALTER TABLE `Pengabdian`
  ADD COLUMN `rumpunIlmu` VARCHAR(191) NULL AFTER `mitra`,
  ADD COLUMN `bidang` VARCHAR(191) NULL AFTER `rumpunIlmu`,
  ADD COLUMN `kataKunci` TEXT NULL AFTER `bidang`;

CREATE OR REPLACE SQL SECURITY INVOKER VIEW `Proposal` AS
SELECT `id`, `tipe`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `skema`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitra`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Penelitian` WHERE `tipe` = 'proposal'
UNION ALL
SELECT `id`, `tipe`, `judul`, `abstrak`, CAST('pengabdian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `skema`, `mitra`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` WHERE `tipe` = 'proposal';

CREATE OR REPLACE SQL SECURITY INVOKER VIEW `Laporan` AS
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `skema`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitra`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Penelitian` WHERE `tipe` = 'laporan'
UNION ALL
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('pengabdian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `skema`, `mitra`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` WHERE `tipe` = 'laporan';

-- 2) Master data (rumpun ilmu, bidang, luaran) -------------------------------------------
-- jenisKegiatan NULL = berlaku untuk penelitian dan pengabdian.
-- jenisLuaran hanya untuk kategori 'luaran' (nilai = LuaranKegiatan.jenis).
CREATE TABLE `MasterData` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kategori` ENUM('rumpun_ilmu', 'bidang', 'luaran') NOT NULL,
    `nama` VARCHAR(191) NOT NULL,
    `jenisKegiatan` ENUM('penelitian', 'pengabdian') NULL,
    `jenisLuaran` ENUM('jurnal', 'prosiding', 'hki', 'buku', 'produk', 'media_massa', 'lainnya') NULL,
    `urutan` INTEGER NOT NULL DEFAULT 0,
    `isAktif` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MasterData_kategori_nama_key`(`kategori`, `nama`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Isi awal (bisa diubah admin lewat /api/v1/master).
-- Rumpun ilmu: 12 rumpun ilmu tingkat 1 DIKTI.
INSERT INTO `MasterData` (`kategori`, `nama`, `jenisKegiatan`, `jenisLuaran`, `urutan`, `isAktif`, `createdAt`, `updatedAt`) VALUES
  ('rumpun_ilmu', 'Matematika dan Ilmu Pengetahuan Alam (MIPA)', NULL, NULL, 1, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Ilmu Tanaman', NULL, NULL, 2, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Ilmu Hewani', NULL, NULL, 3, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Ilmu Kedokteran', NULL, NULL, 4, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Ilmu Kesehatan', NULL, NULL, 5, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Ilmu Teknik', NULL, NULL, 6, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Ilmu Bahasa', NULL, NULL, 7, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Ilmu Ekonomi', NULL, NULL, 8, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Ilmu Sosial Humaniora', NULL, NULL, 9, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Agama dan Filsafat', NULL, NULL, 10, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Seni, Desain, dan Media', NULL, NULL, 11, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Ilmu Pendidikan', NULL, NULL, 12, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
-- Bidang fokus penelitian (mengacu bidang fokus riset nasional).
  ('bidang', 'Pangan', 'penelitian', NULL, 1, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Energi', 'penelitian', NULL, 2, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Kesehatan dan Obat', 'penelitian', NULL, 3, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Transportasi', 'penelitian', NULL, 4, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Produk Rekayasa Keteknikan', 'penelitian', NULL, 5, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Teknologi Informasi dan Komunikasi', 'penelitian', NULL, 6, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Pertahanan dan Keamanan', 'penelitian', NULL, 7, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Kemaritiman', 'penelitian', NULL, 8, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Kebencanaan', 'penelitian', NULL, 9, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Material Maju', 'penelitian', NULL, 10, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Sosial Humaniora, Seni Budaya, dan Pendidikan', 'penelitian', NULL, 11, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
-- Bidang pengabdian kepada masyarakat.
  ('bidang', 'Pendidikan dan Literasi', 'pengabdian', NULL, 1, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Kesehatan Masyarakat', 'pengabdian', NULL, 2, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Pemberdayaan Ekonomi dan UMKM', 'pengabdian', NULL, 3, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Teknologi Tepat Guna', 'pengabdian', NULL, 4, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Digitalisasi dan Teknologi Informasi', 'pengabdian', NULL, 5, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Pertanian dan Ketahanan Pangan', 'pengabdian', NULL, 6, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Lingkungan dan Kebencanaan', 'pengabdian', NULL, 7, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('bidang', 'Sosial, Budaya, dan Pariwisata', 'pengabdian', NULL, 8, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
-- Jenis luaran: 7 pilihan pertama sama dengan daftar statis frontend (UsulanPage).
  ('luaran', 'Artikel jurnal nasional terakreditasi (SINTA)', NULL, 'jurnal', 1, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('luaran', 'Artikel jurnal internasional bereputasi', NULL, 'jurnal', 2, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('luaran', 'Artikel prosiding seminar', NULL, 'prosiding', 3, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('luaran', 'Buku ajar', NULL, 'buku', 4, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('luaran', 'Hak Kekayaan Intelektual (HKI)', NULL, 'hki', 5, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('luaran', 'Teknologi tepat guna', NULL, 'produk', 6, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('luaran', 'Video kegiatan / publikasi media massa', NULL, 'media_massa', 7, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('luaran', 'Purwarupa / prototipe', 'penelitian', 'produk', 8, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('luaran', 'Artikel jurnal pengabdian kepada masyarakat', 'pengabdian', 'jurnal', 9, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('luaran', 'Peningkatan keberdayaan mitra', 'pengabdian', 'lainnya', 10, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
