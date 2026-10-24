-- Rename enum value `ketua_prpm` -> `ketua_lppm` pada kolom Role.name
--
-- MySQL akan menolak MODIFY COLUMN jika masih ada baris dengan value lama
-- yang tidak termasuk di set enum baru, jadi urutannya:
--   1) Perluas enum agar memuat KEDUA value (lama + baru) sementara
--   2) UPDATE baris existing dari value lama ke value baru
--   3) Persempit enum jadi hanya berisi value baru (final)
--
-- Migration ini aman dijalankan baik di database yang masih kosong
-- maupun yang sudah punya baris dengan role `ketua_prpm`.

-- Step 1: perluas enum sementara (memuat ketua_prpm DAN ketua_lppm)
ALTER TABLE `Role`
  MODIFY COLUMN `name` ENUM('admin', 'ketua_prpm', 'ketua_lppm', 'dosen', 'reviewer', 'mahasiswa') NOT NULL;

-- Step 2: migrasikan baris existing (no-op jika belum ada baris ketua_prpm)
UPDATE `Role` SET `name` = 'ketua_lppm' WHERE `name` = 'ketua_prpm';

-- Step 3: persempit enum ke definisi final
ALTER TABLE `Role`
  MODIFY COLUMN `name` ENUM('admin', 'ketua_lppm', 'dosen', 'reviewer', 'mahasiswa') NOT NULL;
