-- Grup B daftar waiting API (docs/waitingApi-list.md):
--   W-04  nilai SINTA diisi dosen sendiri: `sintaId`, `sintaScore` di `User`
--   W-07  foto profil: tabel `UserFoto` (blob terpisah dari `User` agar query user tetap ringan)
--   W-21  hapus akun sendiri = nonaktif + anonimkan: penanda `deletedAt` di `User`
-- W-03/W-13 (tahapan) dihitung dari status proposal + laporan, tanpa kolom baru.
-- W-20 (unduh data akun) tidak butuh perubahan skema.

ALTER TABLE `User`
  ADD COLUMN `sintaId` VARCHAR(191) NULL,
  ADD COLUMN `sintaScore` INTEGER NULL,
  ADD COLUMN `deletedAt` DATETIME(3) NULL;

CREATE TABLE `UserFoto` (
    `userId` INTEGER NOT NULL,
    `fotoBlob` LONGBLOB NOT NULL,
    `fotoMime` VARCHAR(191) NOT NULL,
    `fotoUkuran` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserFoto` ADD CONSTRAINT `UserFoto_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
