-- W-56: kategori & pengirim notifikasi.
-- `kategori` = kolom turunan (STORED) dari `type`, jadi selalu konsisten untuk semua jalur insert
-- (backend, seeder) dan data lama otomatis terisi. `pengirimId` = user yang memicu notifikasi
-- (NULL = sistem / data lama).
ALTER TABLE `Notification`
  ADD COLUMN `kategori` ENUM('kegiatan', 'keputusan', 'review', 'admin')
    GENERATED ALWAYS AS (CASE
      WHEN `type` IN ('proposal_diajukan', 'laporan_diajukan', 'laporan_diunggah') THEN 'kegiatan'
      WHEN `type` IN ('proposal_disetujui', 'proposal_ditolak', 'proposal_revisi', 'laporan_disetujui', 'laporan_ditolak', 'laporan_revisi') THEN 'keputusan'
      WHEN `type` IN ('reviewer_ditugaskan', 'review_selesai') THEN 'review'
      ELSE 'admin'
    END) STORED,
  ADD COLUMN `pengirimId` INTEGER NULL;

CREATE INDEX `Notification_userId_kategori_idx` ON `Notification`(`userId`, `kategori`);

ALTER TABLE `Notification` ADD CONSTRAINT `Notification_pengirimId_fkey` FOREIGN KEY (`pengirimId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
