-- Template proposal yang bisa diganti admin (berubah tiap tahun). Riwayat versi disimpan;
-- satu versi aktif per jenis ('umum' = dipakai bila jenis itu tidak punya template aktif).
CREATE TABLE `TemplateProposal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jenis` ENUM('umum', 'penelitian', 'pengabdian') NOT NULL DEFAULT 'umum',
    `tahun` INTEGER NULL,
    `keterangan` VARCHAR(191) NULL,
    `namaFile` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(191) NOT NULL,
    `ukuran` INTEGER NOT NULL,
    `fileBlob` LONGBLOB NOT NULL,
    `isAktif` BOOLEAN NOT NULL DEFAULT false,
    `diunggahOlehId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TemplateProposal_jenis_isAktif_idx`(`jenis`, `isAktif`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TemplateProposal` ADD CONSTRAINT `TemplateProposal_diunggahOlehId_fkey` FOREIGN KEY (`diunggahOlehId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
