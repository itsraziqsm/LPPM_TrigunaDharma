-- CreateTable
CREATE TABLE `LaporanHarian` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proposalId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `tanggal` DATETIME(3) NOT NULL,
    `kegiatan` TEXT NOT NULL,
    `dokumenNama` VARCHAR(191) NULL,
    `dokumenMime` VARCHAR(191) NULL,
    `dokumenUkuran` INTEGER NULL,
    `dokumenBlob` LONGBLOB NULL,
    `linkGdrive` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LaporanHarian_proposalId_idx`(`proposalId`),
    INDEX `LaporanHarian_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LaporanHarian` ADD CONSTRAINT `LaporanHarian_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Proposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LaporanHarian` ADD CONSTRAINT `LaporanHarian_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
