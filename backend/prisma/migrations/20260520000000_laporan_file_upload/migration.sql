-- AlterTable: LaporanProposal - ubah dokumenUrl menjadi opsional, tambah kolom file blob
ALTER TABLE `LaporanProposal` 
  MODIFY `dokumenUrl` VARCHAR(191) NULL,
  ADD COLUMN `dokumenBlob`   LONGBLOB NULL,
  ADD COLUMN `dokumenNama`   VARCHAR(191) NULL,
  ADD COLUMN `dokumenMime`   VARCHAR(191) NULL,
  ADD COLUMN `dokumenUkuran` INT NULL;
