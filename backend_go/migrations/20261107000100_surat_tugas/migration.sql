-- W-42: arsip surat tugas yang sudah dicetak dengan nomor otomatis berurutan per tahun
-- (format 001/ST/LPPM/<bulan romawi>/<tahun>). Konfigurasi dokumen cetak bersama disimpan di
-- tabel Pengaturan (kunci `cetak.<dokumen>`), tanpa tabel baru.
CREATE TABLE `SuratTugas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nomor` VARCHAR(100) NOT NULL,
    `tahun` INTEGER NOT NULL,
    `urut` INTEGER NOT NULL,
    `kegiatanId` INTEGER NULL,
    `tipe` ENUM('proposal', 'laporan') NOT NULL,
    `jenis` VARCHAR(20) NOT NULL,
    `judulKegiatan` VARCHAR(500) NOT NULL,
    `tugas` TEXT NOT NULL,
    `petugas` TEXT NOT NULL,
    `tanggalMulai` DATE NOT NULL,
    `tanggalSelesai` DATE NULL,
    `alamat` TEXT NOT NULL,
    `penandatangan` TEXT NOT NULL,
    `dibuatOlehId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SuratTugas_nomor_key`(`nomor`),
    UNIQUE INDEX `SuratTugas_tahun_urut_key`(`tahun`, `urut`),
    INDEX `SuratTugas_kegiatanId_idx`(`kegiatanId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SuratTugas` ADD CONSTRAINT `SuratTugas_kegiatanId_fkey` FOREIGN KEY (`kegiatanId`) REFERENCES `Kegiatan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SuratTugas` ADD CONSTRAINT `SuratTugas_dibuatOlehId_fkey` FOREIGN KEY (`dibuatOlehId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
