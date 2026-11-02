-- W-52: admin mereset password user ke password sementara; user wajib mengganti saat login.
ALTER TABLE `User` ADD COLUMN `wajibGantiPassword` BOOLEAN NOT NULL DEFAULT false;

-- Jenis notifikasi baru: password_direset.
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
  'deletion_cancelled',
  'laporan_diajukan',
  'laporan_disetujui',
  'laporan_ditolak',
  'laporan_revisi',
  'password_direset'
) NOT NULL;
