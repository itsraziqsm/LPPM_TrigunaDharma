-- W-47: riwayat halaman yang dibuka & hasil pencarian yang dipilih, per user (lintas perangkat).
-- `jenis` halaman: `kunci` = path (maks 50 per user); cari: `kunci` = tujuan `to`, `data` = JSON
-- {title, subtitle, badge} (maks 4 per user). Batas dijaga oleh backend.
CREATE TABLE `UserRiwayat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `jenis` ENUM('halaman', 'cari') NOT NULL,
    `kunci` VARCHAR(500) NOT NULL,
    `data` TEXT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserRiwayat_userId_jenis_kunci_key`(`userId`, `jenis`, `kunci`),
    INDEX `UserRiwayat_userId_jenis_at_idx`(`userId`, `jenis`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserRiwayat` ADD CONSTRAINT `UserRiwayat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
