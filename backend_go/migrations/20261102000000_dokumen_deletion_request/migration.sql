-- W-34: admin meminta hapus proposal/laporan yang sudah diajukan; Ketua LPPM menyetujui dengan
-- password. Judul & pengusul disalin agar riwayat tetap terbaca setelah dokumen terhapus
-- (kegiatanId menjadi NULL).
CREATE TABLE `DokumenDeletionRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kegiatanId` INTEGER NULL,
    `tipe` ENUM('proposal', 'laporan') NOT NULL,
    `jenis` ENUM('penelitian', 'pengabdian') NOT NULL,
    `judul` TEXT NOT NULL,
    `pengusulId` INTEGER NULL,
    `requesterId` INTEGER NULL,
    `approverId` INTEGER NULL,
    `alasan` TEXT NOT NULL,
    `catatan` TEXT NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DokumenDeletionRequest_kegiatanId_status_idx`(`kegiatanId`, `status`),
    INDEX `DokumenDeletionRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DokumenDeletionRequest` ADD CONSTRAINT `DokumenDeletionRequest_kegiatanId_fkey` FOREIGN KEY (`kegiatanId`) REFERENCES `Kegiatan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `DokumenDeletionRequest` ADD CONSTRAINT `DokumenDeletionRequest_pengusulId_fkey` FOREIGN KEY (`pengusulId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `DokumenDeletionRequest` ADD CONSTRAINT `DokumenDeletionRequest_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `DokumenDeletionRequest` ADD CONSTRAINT `DokumenDeletionRequest_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
