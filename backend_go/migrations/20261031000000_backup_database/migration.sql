-- Backup database: otomatis sebulan sekali oleh sistem + manual oleh admin.
-- File backup (.sql.gz) disimpan di filesystem server (BACKUP_DIR), tabel ini hanya log/metadata.
CREATE TABLE `BackupLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sumber` ENUM('sistem', 'admin') NOT NULL,
    `dibuatOlehId` INTEGER NULL,
    `status` ENUM('berjalan', 'berhasil', 'gagal') NOT NULL DEFAULT 'berjalan',
    `periode` CHAR(7) NULL,
    `namaFile` VARCHAR(191) NULL,
    `ukuran` BIGINT NULL,
    `jumlahTabel` INTEGER NULL,
    `jumlahBaris` BIGINT NULL,
    `pesanError` TEXT NULL,
    `mulaiAt` DATETIME(3) NOT NULL,
    `selesaiAt` DATETIME(3) NULL,
    `dihapusAt` DATETIME(3) NULL,
    `dihapusOlehId` INTEGER NULL,

    INDEX `BackupLog_mulaiAt_idx`(`mulaiAt`),
    INDEX `BackupLog_sumber_periode_idx`(`sumber`, `periode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BackupLog` ADD CONSTRAINT `BackupLog_dibuatOlehId_fkey` FOREIGN KEY (`dibuatOlehId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `BackupLog` ADD CONSTRAINT `BackupLog_dihapusOlehId_fkey` FOREIGN KEY (`dihapusOlehId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
