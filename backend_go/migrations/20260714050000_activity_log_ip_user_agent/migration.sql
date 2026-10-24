-- AlterTable
ALTER TABLE `ActivityLog`
  ADD COLUMN `ipAddress` VARCHAR(191) NULL,
  ADD COLUMN `userAgent` TEXT NULL;
