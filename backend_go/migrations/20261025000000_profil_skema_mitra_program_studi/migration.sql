-- Grup A daftar waiting API (docs/waitingApi-list.md):
--   W-09  kolom `jabatanFungsional` di `User`
--   W-14  kolom `skema` khusus tabel `Penelitian`
--   W-15  kolom `mitra` khusus tabel `Pengabdian`
--   W-19  master data `ProgramStudi` (diisi awal dari nilai programStudi/prodi user)
-- VIEW `Proposal` dan `Laporan` dibuat ulang agar memuat `skema` dan `mitra`
-- (NULL untuk jenis yang tidak memilikinya).

-- 1) Profil dosen -------------------------------------------------------------
ALTER TABLE `User` ADD COLUMN `jabatanFungsional` VARCHAR(191) NULL;

-- 2) Kolom khusus per jenis kegiatan -------------------------------------------
ALTER TABLE `Penelitian` ADD COLUMN `skema` VARCHAR(191) NULL AFTER `luaran`;
ALTER TABLE `Pengabdian` ADD COLUMN `mitra` VARCHAR(191) NULL AFTER `luaran`;

CREATE OR REPLACE SQL SECURITY INVOKER VIEW `Proposal` AS
SELECT `id`, `tipe`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `skema`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitra`,
    `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Penelitian` WHERE `tipe` = 'proposal'
UNION ALL
SELECT `id`, `tipe`, `judul`, `abstrak`, CAST('pengabdian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `skema`, `mitra`,
    `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` WHERE `tipe` = 'proposal';

CREATE OR REPLACE SQL SECURITY INVOKER VIEW `Laporan` AS
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `skema`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitra`,
    `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Penelitian` WHERE `tipe` = 'laporan'
UNION ALL
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('pengabdian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `skema`, `mitra`,
    `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` WHERE `tipe` = 'laporan';

-- 3) Master program studi -------------------------------------------------------
CREATE TABLE `ProgramStudi` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(191) NOT NULL,
    `jenjang` VARCHAR(191) NULL,
    `isAktif` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProgramStudi_nama_key`(`nama`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Isi awal: nilai program studi yang sudah dipakai user (dosen: programStudi,
-- mahasiswa: prodi). Duplikat (beda huruf besar/kecil) dilewati oleh UNIQUE.
INSERT IGNORE INTO `ProgramStudi` (`nama`, `isAktif`, `createdAt`, `updatedAt`)
SELECT TRIM(`nama`), true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3) FROM (
    SELECT `programStudi` AS `nama` FROM `User` WHERE `programStudi` IS NOT NULL
    UNION
    SELECT `prodi` FROM `User` WHERE `prodi` IS NOT NULL
) AS `src`
WHERE TRIM(`nama`) <> ''
ORDER BY 1;
