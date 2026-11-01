// ---------------------------------------------------------------------------
// Terjemahan pesan galat backend (sebagian masih bahasa Inggris karena meniru backend Node
// byte-per-byte) ke bahasa Indonesia untuk ditampilkan di halaman autentikasi.
// Backend tidak diubah; pesan yang sudah berbahasa Indonesia diteruskan apa adanya.
// ---------------------------------------------------------------------------

const PESAN = {
  'Invalid credentials': 'Email atau password salah.',
  'Account not approved yet': 'Akun Anda belum disetujui admin. Silakan tunggu persetujuan sebelum masuk.',
  'User not found': 'Pengguna tidak ditemukan.',
  'Refresh token invalid or expired': 'Sesi Anda sudah berakhir. Silakan masuk kembali.',
  'Refresh token required': 'Sesi Anda sudah berakhir. Silakan masuk kembali.',
  'Token invalid or expired': 'Token tidak valid atau sudah kedaluwarsa.',
  'Failed to send reset email': 'Email atur ulang password gagal dikirim. Coba lagi nanti.',
  'Validation error': 'Data yang diisi belum valid. Periksa kembali isian Anda.',
  'Resource already exists': 'Data ini sudah terdaftar.',
  'Internal server error': 'Terjadi kesalahan pada server. Coba lagi beberapa saat lagi.',
  'Too many requests, please try again later.': 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.',
  'Too many attempts, try again in 15 minutes.': 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.',
  'Too many registrations from this IP.': 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi dalam 1 jam.',
  'Unauthorized': 'Anda belum masuk atau sesi sudah berakhir.',
  'Forbidden': 'Anda tidak memiliki akses.',
  'Route not found': 'Alamat tidak ditemukan.',
  Required: 'Wajib diisi.',
  'Invalid email': 'Format email tidak valid.',
  'Invalid input': 'Isian tidak valid.',
  'Invalid date': 'Tanggal tidak valid.',
  'Invalid datetime': 'Tanggal dan waktu tidak valid.',
  'Network Error': 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
}

const POLA = [
  [/^String must contain at least (\d+) character\(s\)$/, (n) => `Minimal ${n} karakter.`],
  [/^String must contain at most (\d+) character\(s\)$/, (n) => `Maksimal ${n} karakter.`],
  [/^Array must contain at least (\d+) element\(s\)$/, (n) => `Minimal ${n} item.`],
  [/^Number must be greater than or equal to (.+)$/, (n) => `Minimal ${n}.`],
  [/^Number must be greater than (.+)$/, (n) => `Harus lebih dari ${n}.`],
  [/^Number must be less than or equal to (.+)$/, (n) => `Maksimal ${n}.`],
  [/^Expected (\w+), received (\w+)$/, () => 'Jenis isian tidak sesuai.'],
  [/^Invalid enum value\./, () => 'Pilihan tidak valid.'],
  [/^Request failed with status code (\d+)$/, (k) => `Permintaan gagal (kode ${k}). Coba lagi.`],
  [/^timeout of \d+ms exceeded$/, () => 'Server terlalu lama merespons. Coba lagi.'],
]

// Satu pesan → bahasa Indonesia (tidak dikenal = dikembalikan apa adanya).
export function terjemahkan(pesan) {
  if (typeof pesan !== 'string' || !pesan) return pesan
  const t = pesan.trim()
  if (PESAN[t]) return PESAN[t]
  for (const [re, fn] of POLA) {
    const m = t.match(re)
    if (m) return fn(...m.slice(1))
  }
  return pesan
}

// Pesan dari galat axios: pesan server diterjemahkan; tanpa respons = galat jaringan.
export function pesanDariGalat(err, cadangan) {
  const res = err?.response
  if (!res) return err?.code === 'ECONNABORTED' ? terjemahkan('timeout of 0ms exceeded') : PESAN['Network Error']
  if (res.status === 429 && !res.data?.message) return PESAN['Too many requests, please try again later.']
  return terjemahkan(res.data?.message) || cadangan
}

// Galat per kolom (422 {"errors":{"kolom":["pesan"]}}) → diterjemahkan.
export const terjemahkanKolom = (errors) =>
  errors && typeof errors === 'object'
    ? Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [].concat(v).map(terjemahkan)]))
    : errors
