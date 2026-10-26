-- Peran baru Ketua STMIK: memantau seluruh proposal (dosen pengusul, status/progres, anggaran),
-- hanya baca. Akun contoh dibuat terpisah lewat `go run ./cmd/seed-email`.
ALTER TABLE `Role`
  MODIFY COLUMN `name` ENUM('admin', 'ketua_lppm', 'ketua_stmik', 'dosen', 'reviewer', 'mahasiswa') NOT NULL;

INSERT INTO `Role` (`name`, `createdAt`, `updatedAt`)
SELECT 'ketua_stmik', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Role` WHERE `name` = 'ketua_stmik');
