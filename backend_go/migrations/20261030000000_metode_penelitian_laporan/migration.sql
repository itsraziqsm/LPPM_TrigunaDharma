-- W-28 daftar waiting API (docs/waitingApi-list.md): metode penelitian pada laporan
-- penelitian. Kolom `metodePenelitian` khusus tabel `Penelitian`, hanya dipakai baris
-- tipe 'laporan'. VIEW `Laporan` dibuat ulang (NULL untuk pengabdian).
-- W-27 (kata kunci laporan) dan W-30 (ketua mengatur peran reviewer) tanpa perubahan skema.

ALTER TABLE `Penelitian` ADD COLUMN `metodePenelitian` TEXT NULL AFTER `realisasiAnggaran`;

CREATE OR REPLACE SQL SECURITY INVOKER VIEW `Laporan` AS
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('penelitian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, `skema`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitra`,
    CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraJenis`,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraAlamat`,
    CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraKontak`,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `mitraKebutuhan`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`, `metodePenelitian`, `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Penelitian` WHERE `tipe` = 'laporan'
UNION ALL
SELECT `id`, `tipe`, `proposalId`, `judul`, `abstrak`, CAST('pengabdian' AS CHAR(10) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `jenis`,
    `status`, `anggaran`, `luaran`, CAST(NULL AS CHAR(191) CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `skema`, `mitra`,
    `mitraJenis`, `mitraAlamat`, `mitraKontak`, `mitraKebutuhan`,
    `rumpunIlmu`, `bidang`, `kataKunci`,
    `luaranTercapai`, `ringkasanHasil`, `realisasiAnggaran`,
    CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS `metodePenelitian`,
    `catatanRevisi`, `pengusulId`, `periodeId`,
    `dokumenUrl`, `dokumenNama`, `dokumenMime`, `dokumenUkuran`, `submittedAt`, `approvedAt`, `createdAt`, `updatedAt`
FROM `Pengabdian` WHERE `tipe` = 'laporan';
