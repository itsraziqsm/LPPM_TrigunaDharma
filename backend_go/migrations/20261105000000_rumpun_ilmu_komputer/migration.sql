-- Rumpun ilmu difokuskan ke bidang komputer (STMIK Triguna Dharma). 12 rumpun ilmu umum DIKTI
-- dinonaktifkan (tidak dihapus agar data lama tetap terbaca, muncul di ?semua=true) dan diganti
-- daftar rumpun ilmu komputer. Backend menolak rumpunIlmu di luar daftar aktif (400).
UPDATE `MasterData` SET `isAktif` = false, `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `kategori` = 'rumpun_ilmu' AND `nama` IN (
  'Matematika dan Ilmu Pengetahuan Alam (MIPA)', 'Ilmu Tanaman', 'Ilmu Hewani', 'Ilmu Kedokteran', 'Ilmu Kesehatan',
  'Ilmu Teknik', 'Ilmu Bahasa', 'Ilmu Ekonomi', 'Ilmu Sosial Humaniora', 'Agama dan Filsafat',
  'Seni, Desain, dan Media', 'Ilmu Pendidikan');

INSERT INTO `MasterData` (`kategori`, `nama`, `jenisKegiatan`, `jenisLuaran`, `urutan`, `isAktif`, `createdAt`, `updatedAt`) VALUES
  ('rumpun_ilmu', 'Ilmu Komputer', NULL, NULL, 1, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Teknik Informatika', NULL, NULL, 2, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Sistem Informasi', NULL, NULL, 3, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Sistem Komputer', NULL, NULL, 4, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Teknik Komputer', NULL, NULL, 5, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Manajemen Informatika', NULL, NULL, 6, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Teknologi Informasi', NULL, NULL, 7, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Rekayasa Perangkat Lunak', NULL, NULL, 8, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Jaringan Komputer dan Keamanan Siber', NULL, NULL, 9, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Kecerdasan Buatan dan Sains Data', NULL, NULL, 10, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Sistem Tertanam dan Internet of Things (IoT)', NULL, NULL, 11, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('rumpun_ilmu', 'Multimedia dan Teknologi Game', NULL, NULL, 12, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `isAktif` = true, `urutan` = VALUES(`urutan`), `updatedAt` = CURRENT_TIMESTAMP(3);
