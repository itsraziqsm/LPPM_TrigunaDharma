-- AlterTable: tambah kolom blob + buat fileUrl nullable
ALTER TABLE `DokumenLampiran` ADD COLUMN `fileBlob` LONGBLOB NULL,
                              ADD COLUMN `fileMime` VARCHAR(191) NULL,
                              ADD COLUMN `fileNama` VARCHAR(191) NULL;

ALTER TABLE `DokumenLampiran` MODIFY `fileUrl` VARCHAR(191) NULL;
