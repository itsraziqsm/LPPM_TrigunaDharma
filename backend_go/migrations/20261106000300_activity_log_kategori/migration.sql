-- W-53: kategori resmi per log aktivitas (diisi backend saat mencatat), data lama di-backfill
-- dari awalan `action`.
ALTER TABLE `ActivityLog`
  ADD COLUMN `kategori` ENUM('auth', 'akun', 'proposal', 'review', 'laporan', 'dokumen', 'periode', 'template', 'luaran', 'backup', 'sistem') NOT NULL DEFAULT 'sistem';

UPDATE `ActivityLog` SET `kategori` = CASE
  WHEN `action` LIKE 'LOGIN%' OR `action` LIKE 'LOGOUT%' THEN 'auth'
  WHEN `action` LIKE 'user.%' THEN 'akun'
  WHEN `action` LIKE 'proposal.%' THEN 'proposal'
  WHEN `action` LIKE 'reviewer.%' OR `action` LIKE 'review.%' THEN 'review'
  WHEN `action` LIKE 'laporan%' THEN 'laporan'
  WHEN `action` LIKE 'dokumen.%' THEN 'dokumen'
  WHEN `action` LIKE 'periode.%' THEN 'periode'
  WHEN `action` LIKE 'template.%' THEN 'template'
  WHEN `action` LIKE 'luaran.%' THEN 'luaran'
  WHEN `action` LIKE 'backup.%' THEN 'backup'
  ELSE 'sistem'
END;

CREATE INDEX `ActivityLog_kategori_createdAt_idx` ON `ActivityLog`(`kategori`, `createdAt`);
CREATE INDEX `ActivityLog_createdAt_idx` ON `ActivityLog`(`createdAt`);
