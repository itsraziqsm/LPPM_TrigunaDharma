-- Grup C daftar waiting API (docs/waitingApi-list.md):
--   W-01/W-02/W-12  item luaran terstruktur: target dijanjikan di proposal, capaian diisi
--                   saat menyusun laporan (tabel `LuaranKegiatan`)
--   W-06            nilai kepercayaan dihitung dari data yang ada (tanpa kolom baru)
--   W-18            verifikasi email opsional: `User.emailVerifiedAt` + `EmailVerificationToken`
-- (W-05 sertifikasi ditunda; halaman /luaran = pencairan dana, belum dibuat.)

-- 1) Item luaran per proposal --------------------------------------------------------
CREATE TABLE `LuaranKegiatan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proposalId` INTEGER NOT NULL,
    `jenis` ENUM('jurnal', 'prosiding', 'hki', 'buku', 'produk', 'media_massa', 'lainnya') NOT NULL,
    `target` VARCHAR(191) NOT NULL,
    `targetTanggal` DATETIME(3) NULL,
    `status` ENUM('belum', 'tercapai') NOT NULL DEFAULT 'belum',
    `judulCapaian` VARCHAR(191) NULL,
    `keterangan` TEXT NULL,
    `tercapaiAt` DATETIME(3) NULL,
    `buktiUrl` VARCHAR(191) NULL,
    `buktiNama` VARCHAR(191) NULL,
    `buktiMime` VARCHAR(191) NULL,
    `buktiUkuran` INTEGER NULL,
    `buktiBlob` LONGBLOB NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LuaranKegiatan_proposalId_idx`(`proposalId`),
    INDEX `LuaranKegiatan_jenis_status_idx`(`jenis`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LuaranKegiatan` ADD CONSTRAINT `LuaranKegiatan_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Kegiatan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Verifikasi email (opsional, login tetap bisa) ----------------------------------
ALTER TABLE `User` ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL;

-- User yang sudah ada dianggap sudah terverifikasi.
UPDATE `User` SET `emailVerifiedAt` = `createdAt` WHERE `deletedAt` IS NULL;

CREATE TABLE `EmailVerificationToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailVerificationToken_token_key`(`token`),
    INDEX `EmailVerificationToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
