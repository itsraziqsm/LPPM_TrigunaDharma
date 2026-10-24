-- W-26 daftar waiting API (docs/waitingApi-list.md): detail mitra pengabdian selain nama.
--   Kolom `mitraJenis`, `mitraAlamat`, `mitraKontak`, `mitraKebutuhan` khusus tabel `Pengabdian`
--   (satu mitra per proposal, melengkapi kolom `mitra` = nama mitra).
--   Master pilihan jenis mitra: kategori baru `jenis_mitra` di `MasterData`.
-- VIEW `Proposal` dan `Laporan` dibuat ulang (NULL untuk penelitian).

ALTER TABLE `Pengabdian`
  ADD COLUMN `mitraJenis` VARCHAR(191) NULL AFTER `mitra`,
  ADD COLUMN `mitraAlamat` TEXT NULL AFTER `mitraJenis`,
  ADD COLUMN `mitraKontak` VARCHAR(191) NULL AFTER `mitraAlamat`,
  ADD COLUMN `mitraKebutuhan` TEXT NULL AFTER `mitraKontak`;

CREATE OR REPLACE SQL SECURITY INVOKER VIEW `Proposal` AS
SELECT `id`, `tipe`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `skema`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitra`,
    CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraJenis`,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraAlamat`,
    CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraKontak`,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraKebutuhan`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Penelitian` WHERE `tipe` = 'proposal'
UNION ALL
SELECT `id`, `tipe`, `judul`, `abstrak`, CAST('pengabdian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `skema`, `mitra`,
    `mitraJenis`, `mitraAlamat`, `mitraKontak`, `mitraKebutuhan`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` WHERE `tipe` = 'proposal';

CREATE OR REPLACE SQL SECURITY INVOKER VIEW `Laporan` AS
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `skema`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitra`,
    CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraJenis`,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraAlamat`,
    CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraKontak`,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraKebutuhan`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Penelitian` WHERE `tipe` = 'laporan'
UNION ALL
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('pengabdian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `skema`, `mitra`,
    `mitraJenis`, `mitraAlamat`, `mitraKontak`, `mitraKebutuhan`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` WHERE `tipe` = 'laporan';

-- Master jenis mitra (bisa diubah admin lewat /api/v1/master/jenis-mitra).
ALTER TABLE `MasterData` MODIFY COLUMN `kategori` ENUM('rumpun_ilmu', 'bidang', 'luaran', 'jenis_mitra') NOT NULL;

INSERT INTO `MasterData` (`kategori`, `nama`, `jenisKegiatan`, `jenisLuaran`, `urutan`, `isAktif`, `createdAt`, `updatedAt`) VALUES
  ('jenis_mitra', 'Kelompok masyarakat', 'pengabdian', NULL, 1, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('jenis_mitra', 'UMKM', 'pengabdian', NULL, 2, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('jenis_mitra', 'Koperasi', 'pengabdian', NULL, 3, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('jenis_mitra', 'Sekolah / lembaga pendidikan', 'pengabdian', NULL, 4, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('jenis_mitra', 'Pemerintah desa / kelurahan', 'pengabdian', NULL, 5, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('jenis_mitra', 'Instansi pemerintah', 'pengabdian', NULL, 6, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('jenis_mitra', 'Organisasi kemasyarakatan / LSM', 'pengabdian', NULL, 7, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('jenis_mitra', 'Dunia usaha / industri', 'pengabdian', NULL, 8, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('jenis_mitra', 'Lainnya', 'pengabdian', NULL, 9, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
