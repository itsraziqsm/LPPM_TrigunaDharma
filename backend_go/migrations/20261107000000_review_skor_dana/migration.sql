-- W-54: form penilaian reviewer — skor per komponen + catatan singkat (ReviewSkor), dana disetujui per
-- review (ProposalReview.danaDisetujui), dan dana final kegiatan (Penelitian/Pengabdian.danaDisetujui) yang
-- diisi saat review proposal difinalisasi. VIEW `Proposal` & `Laporan` dibuat ulang dengan `danaDisetujui`
-- (laporan = dana disetujui proposal asal).
CREATE TABLE `ReviewSkor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reviewId` INTEGER NOT NULL,
    `kode` VARCHAR(40) NOT NULL,
    `skor` TINYINT NOT NULL,
    `catatan` VARCHAR(200) NULL,

    UNIQUE INDEX `ReviewSkor_reviewId_kode_key`(`reviewId`, `kode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ReviewSkor` ADD CONSTRAINT `ReviewSkor_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `ProposalReview`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ProposalReview` ADD COLUMN `danaDisetujui` DECIMAL(15, 2) NULL;
ALTER TABLE `Penelitian` ADD COLUMN `danaDisetujui` DECIMAL(15, 2) NULL AFTER `anggaran`;
ALTER TABLE `Pengabdian` ADD COLUMN `danaDisetujui` DECIMAL(15, 2) NULL AFTER `anggaran`;

-- Data lama: proposal yang sudah disetujui sebelum fitur ini dianggap disetujui sebesar dana yang diusulkan.
UPDATE `Penelitian` SET `danaDisetujui` = `anggaran` WHERE `tipe` = 'proposal' AND `status` = 'disetujui';
UPDATE `Pengabdian` SET `danaDisetujui` = `anggaran` WHERE `tipe` = 'proposal' AND `status` = 'disetujui';

CREATE OR REPLACE SQL SECURITY INVOKER VIEW `Proposal` AS
SELECT `id`, `tipe`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `danaDisetujui`, `luaran`, `skema`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitra`,
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
    `status`, `anggaran`, `danaDisetujui`, `luaran`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `skema`, `mitra`,
    `mitraJenis`, `mitraAlamat`, `mitraKontak`, `mitraKebutuhan`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` WHERE `tipe` = 'proposal';

CREATE OR REPLACE SQL SECURITY INVOKER VIEW `Laporan` AS
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`,
    (SELECT pp.`danaDisetujui` FROM `Penelitian` pp WHERE pp.`id` = l.`proposalId`) AS `danaDisetujui`, `luaran`, `skema`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitra`,
    CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraJenis`,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraAlamat`,
    CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraKontak`,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraKebutuhan`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `metodePenelitian`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Penelitian` l WHERE `tipe` = 'laporan'
UNION ALL
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('pengabdian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`,
    (SELECT pp.`danaDisetujui` FROM `Pengabdian` pp WHERE pp.`id` = l.`proposalId`) AS `danaDisetujui`, `luaran`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `skema`, `mitra`,
    `mitraJenis`, `mitraAlamat`, `mitraKontak`, `mitraKebutuhan`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `metodePenelitian`,
    `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` l WHERE `tipe` = 'laporan';
