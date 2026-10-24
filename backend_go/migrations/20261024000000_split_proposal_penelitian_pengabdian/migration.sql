-- Pecah tabel `Proposal` menjadi dua tabel fisik: `Penelitian` dan `Pengabdian`,
-- dan tambahkan kolom `tipe` ENUM('proposal','laporan') untuk tahap dokumen.
--
-- Rancangan:
--   * `Kegiatan`   : registri id global. Setiap baris Penelitian/Pengabdian
--                    (proposal maupun laporan) mendapat id dari sini, sehingga id
--                    tidak pernah bentrok antar dua tabel. Tabel relasi
--                    (ProposalAnggota, ReviewerTugasan, ProposalReview,
--                    LaporanProposal, DokumenLampiran, LaporanHarian, ActivityLog)
--                    tetap memakai kolom `proposalId`, kini ber-FK ke `Kegiatan`.
--                    Menghapus baris `Kegiatan` ikut menghapus baris
--                    Penelitian/Pengabdian dan seluruh relasinya (CASCADE).
--   * `Penelitian`, `Pengabdian` : data fisik, struktur kolom identik.
--                    `proposalId` hanya terisi untuk tipe 'laporan' (menunjuk
--                    proposal asal; maksimal 1 laporan per proposal).
--   * VIEW `Proposal` : gabungan baris tipe 'proposal' dari kedua tabel (tanpa
--                    kolom blob), agar kode baca lama tetap berjalan. VIEW ini
--                    hanya untuk SELECT; INSERT/UPDATE ke tabel fisik.
--   * VIEW `Laporan`  : gabungan baris tipe 'laporan' dari kedua tabel.
--
-- Data lama: semua baris `Proposal` dipindah apa adanya (id sama) dengan
-- tipe = 'proposal'. Belum ada baris 'laporan'.
--
-- PENTING: DDL MySQL tidak transaksional. BACKUP database sebelum menjalankan
-- migrasi ini (mysqldump). Jika gagal di tengah, pulihkan dari backup.

-- 1) Registri id global ------------------------------------------------------
CREATE TABLE `Kegiatan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jenis` ENUM('penelitian', 'pengabdian') NOT NULL,
    `tipe` ENUM('proposal', 'laporan') NOT NULL DEFAULT 'proposal',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Kegiatan_jenis_tipe_idx`(`jenis`, `tipe`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Kegiatan` (`id`, `jenis`, `tipe`, `createdAt`)
SELECT `id`, `jenis`, 'proposal', `createdAt` FROM `Proposal`;

-- 2) Tabel fisik -------------------------------------------------------------
CREATE TABLE `Penelitian` (
    `id` INTEGER NOT NULL,
    `tipe` ENUM('proposal', 'laporan') NOT NULL DEFAULT 'proposal',
    `proposalId` INTEGER NULL,
    `judul` VARCHAR(191) NOT NULL,
    `abstrak` TEXT NOT NULL,
    `status` ENUM('draft', 'diajukan', 'review', 'revisi', 'disetujui', 'ditolak') NOT NULL DEFAULT 'draft',
    `anggaran` DECIMAL(15, 2) NULL,
    `luaran` TEXT NULL,
    `luaranTercapai` TEXT NULL,
    `ringkasanHasil` TEXT NULL,
    `realisasiAnggaran` DECIMAL(15, 2) NULL,
    `catatanRevisi` TEXT NULL,
    `pengusulId` INTEGER NOT NULL,
    `periodeId` INTEGER NULL,
    `dokumenUrl` VARCHAR(191) NULL,
    `dokumenNama` VARCHAR(191) NULL,
    `dokumenMime` VARCHAR(191) NULL,
    `dokumenUkuran` INTEGER NULL,
    `dokumenBlob` LONGBLOB NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Penelitian_proposalId_key`(`proposalId`),
    INDEX `Penelitian_tipe_status_idx`(`tipe`, `status`),
    INDEX `Penelitian_pengusulId_idx`(`pengusulId`),
    INDEX `Penelitian_periodeId_idx`(`periodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Pengabdian` (
    `id` INTEGER NOT NULL,
    `tipe` ENUM('proposal', 'laporan') NOT NULL DEFAULT 'proposal',
    `proposalId` INTEGER NULL,
    `judul` VARCHAR(191) NOT NULL,
    `abstrak` TEXT NOT NULL,
    `status` ENUM('draft', 'diajukan', 'review', 'revisi', 'disetujui', 'ditolak') NOT NULL DEFAULT 'draft',
    `anggaran` DECIMAL(15, 2) NULL,
    `luaran` TEXT NULL,
    `luaranTercapai` TEXT NULL,
    `ringkasanHasil` TEXT NULL,
    `realisasiAnggaran` DECIMAL(15, 2) NULL,
    `catatanRevisi` TEXT NULL,
    `pengusulId` INTEGER NOT NULL,
    `periodeId` INTEGER NULL,
    `dokumenUrl` VARCHAR(191) NULL,
    `dokumenNama` VARCHAR(191) NULL,
    `dokumenMime` VARCHAR(191) NULL,
    `dokumenUkuran` INTEGER NULL,
    `dokumenBlob` LONGBLOB NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Pengabdian_proposalId_key`(`proposalId`),
    INDEX `Pengabdian_tipe_status_idx`(`tipe`, `status`),
    INDEX `Pengabdian_pengusulId_idx`(`pengusulId`),
    INDEX `Pengabdian_periodeId_idx`(`periodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) Salin data proposal yang sudah ada (tipe = 'proposal') -------------------
INSERT INTO `Penelitian` (`id`, `tipe`, `proposalId`, `judul`, `abstrak`, `status`, `anggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `dokumenBlob`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`)
SELECT `id`, 'proposal', NULL, `judul`, `abstrak`, `status`, `anggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `dokumenBlob`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Proposal` WHERE `jenis` = 'penelitian';

INSERT INTO `Pengabdian` (`id`, `tipe`, `proposalId`, `judul`, `abstrak`, `status`, `anggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `dokumenBlob`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`)
SELECT `id`, 'proposal', NULL, `judul`, `abstrak`, `status`, `anggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `dokumenBlob`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Proposal` WHERE `jenis` = 'pengabdian';

-- 4) FK tabel fisik ----------------------------------------------------------
ALTER TABLE `Penelitian` ADD CONSTRAINT `Penelitian_id_fkey` FOREIGN KEY (`id`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Penelitian` ADD CONSTRAINT `Penelitian_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Penelitian` ADD CONSTRAINT `Penelitian_pengusulId_fkey` FOREIGN KEY (`pengusulId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Penelitian` ADD CONSTRAINT `Penelitian_periodeId_fkey` FOREIGN KEY (`periodeId`) REFERENCES `Periode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Pengabdian` ADD CONSTRAINT `Pengabdian_id_fkey` FOREIGN KEY (`id`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Pengabdian` ADD CONSTRAINT `Pengabdian_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Pengabdian` ADD CONSTRAINT `Pengabdian_pengusulId_fkey` FOREIGN KEY (`pengusulId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Pengabdian` ADD CONSTRAINT `Pengabdian_periodeId_fkey` FOREIGN KEY (`periodeId`) REFERENCES `Periode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Alihkan FK tabel relasi dari `Proposal` ke `Kegiatan` -------------------
ALTER TABLE `ProposalAnggota` DROP FOREIGN KEY `ProposalAnggota_proposalId_fkey`;
ALTER TABLE `ProposalAnggota` ADD CONSTRAINT `ProposalAnggota_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReviewerTugasan` DROP FOREIGN KEY `ReviewerTugasan_proposalId_fkey`;
ALTER TABLE `ReviewerTugasan` ADD CONSTRAINT `ReviewerTugasan_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ProposalReview` DROP FOREIGN KEY `ProposalReview_proposalId_fkey`;
ALTER TABLE `ProposalReview` ADD CONSTRAINT `ProposalReview_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `LaporanProposal` DROP FOREIGN KEY `LaporanProposal_proposalId_fkey`;
ALTER TABLE `LaporanProposal` ADD CONSTRAINT `LaporanProposal_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DokumenLampiran` DROP FOREIGN KEY `DokumenLampiran_proposalId_fkey`;
ALTER TABLE `DokumenLampiran` ADD CONSTRAINT `DokumenLampiran_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `LaporanHarian` DROP FOREIGN KEY `LaporanHarian_proposalId_fkey`;
ALTER TABLE `LaporanHarian` ADD CONSTRAINT `LaporanHarian_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ActivityLog` DROP FOREIGN KEY `ActivityLog_proposalId_fkey`;
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Kegiatan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 6) Hapus tabel lama, ganti dengan VIEW untuk baca ---------------------------
DROP TABLE `Proposal`;

CREATE SQL SECURITY INVOKER VIEW `Proposal` AS
SELECT `id`, `tipe`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Penelitian` WHERE `tipe` = 'proposal'
UNION ALL
SELECT `id`, `tipe`, `judul`, `abstrak`, CAST('pengabdian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` WHERE `tipe` = 'proposal';

CREATE SQL SECURITY INVOKER VIEW `Laporan` AS
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Penelitian` WHERE `tipe` = 'laporan'
UNION ALL
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('pengabdian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` WHERE `tipe` = 'laporan';

-- 7) Jenis notifikasi baru untuk alur laporan --------------------------------
ALTER TABLE `Notification` MODIFY COLUMN `type` ENUM(
  'proposal_diajukan',
  'proposal_disetujui',
  'proposal_ditolak',
  'proposal_revisi',
  'reviewer_ditugaskan',
  'review_selesai',
  'laporan_diunggah',
  'deletion_request',
  'deletion_approved',
  'deletion_cancelled',
  'laporan_diajukan',
  'laporan_disetujui',
  'laporan_ditolak',
  'laporan_revisi'
) NOT NULL;
