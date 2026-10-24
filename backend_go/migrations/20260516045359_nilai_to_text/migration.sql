/*
  Warnings:

  - You are about to drop the column `nilaiTotal` on the `ProposalReview` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `ProposalReview` DROP COLUMN `nilaiTotal`,
    MODIFY `nilaiRelevansi` TEXT NULL,
    MODIFY `nilaiMetodologi` TEXT NULL,
    MODIFY `nilaiAnggaran` TEXT NULL,
    MODIFY `nilaiLuaran` TEXT NULL;