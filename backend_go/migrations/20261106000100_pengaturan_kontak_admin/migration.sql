-- W-50: pengaturan umum key-value (dipakai pertama untuk kontak admin: kontak_admin.whatsapp,
-- kontak_admin.nama, kontak_admin.jamLayanan). Diubah admin tanpa build ulang frontend.
CREATE TABLE `Pengaturan` (
    `kunci` VARCHAR(100) NOT NULL,
    `nilai` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedById` INTEGER NULL,

    PRIMARY KEY (`kunci`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Pengaturan` ADD CONSTRAINT `Pengaturan_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
