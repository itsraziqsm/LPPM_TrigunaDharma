-- CreateTable
CREATE TABLE `Role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` ENUM('admin', 'ketua_prpm', 'dosen', 'reviewer', 'mahasiswa') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `nidn` VARCHAR(191) NULL,
    `tempatLahir` VARCHAR(191) NULL,
    `tanggalLahir` DATETIME(3) NULL,
    `institusi` VARCHAR(191) NULL,
    `programStudi` VARCHAR(191) NULL,
    `alamat` VARCHAR(191) NULL,
    `kontak` VARCHAR(191) NULL,
    `nim` VARCHAR(191) NULL,
    `prodi` VARCHAR(191) NULL,
    `noHp` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_nidn_key`(`nidn`),
    UNIQUE INDEX `User_nim_key`(`nim`),
    INDEX `User_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(512) NOT NULL,
    `userId` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revoked` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_token_key`(`token`),
    INDEX `RefreshToken_userId_idx`(`userId`),
    INDEX `RefreshToken_token_idx`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_token_key`(`token`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRole` (
    `userId` INTEGER NOT NULL,
    `roleId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Periode` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(191) NOT NULL,
    `tahun` INTEGER NOT NULL,
    `jenis` ENUM('penelitian', 'pengabdian') NOT NULL,
    `tanggalMulai` DATETIME(3) NOT NULL,
    `tanggalSelesai` DATETIME(3) NOT NULL,
    `isAktif` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Periode_tahun_jenis_idx`(`tahun`, `jenis`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Proposal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `judul` VARCHAR(191) NOT NULL,
    `abstrak` TEXT NOT NULL,
    `jenis` ENUM('penelitian', 'pengabdian') NOT NULL,
    `status` ENUM('draft', 'diajukan', 'review', 'revisi', 'disetujui', 'ditolak') NOT NULL DEFAULT 'draft',
    `anggaran` DECIMAL(15, 2) NULL,
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

    INDEX `Proposal_status_jenis_idx`(`status`, `jenis`),
    INDEX `Proposal_pengusulId_idx`(`pengusulId`),
    INDEX `Proposal_periodeId_idx`(`periodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProposalAnggota` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proposalId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `peran` VARCHAR(191) NOT NULL DEFAULT 'anggota',
    `statusUndangan` ENUM('pending', 'diterima', 'ditolak') NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProposalAnggota_proposalId_userId_key`(`proposalId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReviewerTugasan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proposalId` INTEGER NOT NULL,
    `reviewerId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReviewerTugasan_proposalId_reviewerId_key`(`proposalId`, `reviewerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProposalReview` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proposalId` INTEGER NOT NULL,
    `reviewerId` INTEGER NOT NULL,
    `nilaiRelevansi` INTEGER NULL,
    `nilaiMetodologi` INTEGER NULL,
    `nilaiAnggaran` INTEGER NULL,
    `nilaiLuaran` INTEGER NULL,
    `nilaiTotal` DECIMAL(5, 2) NULL,
    `catatan` TEXT NULL,
    `rekomendasi` ENUM('draft', 'diajukan', 'review', 'revisi', 'disetujui', 'ditolak') NULL,
    `isDone` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProposalReview_proposalId_reviewerId_key`(`proposalId`, `reviewerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LaporanProposal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proposalId` INTEGER NOT NULL,
    `jenis` VARCHAR(191) NOT NULL,
    `judul` VARCHAR(191) NOT NULL,
    `dokumenUrl` VARCHAR(191) NOT NULL,
    `keterangan` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LaporanProposal_proposalId_idx`(`proposalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DokumenLampiran` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proposalId` INTEGER NOT NULL,
    `namaFile` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `ukuran` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DokumenLampiran_proposalId_idx`(`proposalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `type` ENUM('proposal_diajukan', 'proposal_disetujui', 'proposal_ditolak', 'proposal_revisi', 'reviewer_ditugaskan', 'review_selesai', 'laporan_diunggah') NOT NULL,
    `judul` VARCHAR(191) NOT NULL,
    `pesan` TEXT NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `refId` INTEGER NULL,
    `refType` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_isRead_idx`(`userId`, `isRead`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NULL,
    `entityId` INTEGER NULL,
    `detail` TEXT NULL,
    `proposalId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_userId_idx`(`userId`),
    INDEX `ActivityLog_proposalId_idx`(`proposalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Proposal` ADD CONSTRAINT `Proposal_pengusulId_fkey` FOREIGN KEY (`pengusulId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Proposal` ADD CONSTRAINT `Proposal_periodeId_fkey` FOREIGN KEY (`periodeId`) REFERENCES `Periode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProposalAnggota` ADD CONSTRAINT `ProposalAnggota_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Proposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProposalAnggota` ADD CONSTRAINT `ProposalAnggota_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewerTugasan` ADD CONSTRAINT `ReviewerTugasan_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Proposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewerTugasan` ADD CONSTRAINT `ReviewerTugasan_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProposalReview` ADD CONSTRAINT `ProposalReview_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Proposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProposalReview` ADD CONSTRAINT `ProposalReview_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LaporanProposal` ADD CONSTRAINT `LaporanProposal_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Proposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DokumenLampiran` ADD CONSTRAINT `DokumenLampiran_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Proposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `Proposal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
