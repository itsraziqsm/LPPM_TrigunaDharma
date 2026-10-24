-- AlterEnum: tambah nilai baru ke NotifType
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
  'deletion_cancelled'
) NOT NULL;

-- CreateTable: PeriodeDeletionRequest
CREATE TABLE `PeriodeDeletionRequest` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `periodeId`   INT NOT NULL,
  `requesterId` INT NOT NULL,
  `approverId`  INT NULL,
  `status`      ENUM('pending', 'approved', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  `expiresAt`   DATETIME(3) NOT NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX `PeriodeDeletionRequest_periodeId_idx`(`periodeId`),
  INDEX `PeriodeDeletionRequest_requesterId_idx`(`requesterId`),
  INDEX `PeriodeDeletionRequest_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PeriodeDeletionRequest`
  ADD CONSTRAINT `PeriodeDeletionRequest_periodeId_fkey`
  FOREIGN KEY (`periodeId`) REFERENCES `Periode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PeriodeDeletionRequest`
  ADD CONSTRAINT `PeriodeDeletionRequest_requesterId_fkey`
  FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PeriodeDeletionRequest`
  ADD CONSTRAINT `PeriodeDeletionRequest_approverId_fkey`
  FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;