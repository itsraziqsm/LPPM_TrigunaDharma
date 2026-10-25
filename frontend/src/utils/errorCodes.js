import {
  CircleAlert,
  Construction,
  FileQuestion,
  Gauge,
  Hourglass,
  LockKeyhole,
  ServerCrash,
  ShieldX,
  TimerOff,
  Unplug,
  Wrench,
} from 'lucide-react'

// Isi halaman galat per kode HTTP. `tone` memilih warna ubin ikon:
// info (navy), warning (kuning), danger (merah). `retry` = tampilkan tombol
// "Coba lagi" (muat ulang), `login` = arahkan ke halaman masuk. `image` =
// ilustrasi (PNG latar transparan → WebP) di public/images/errors/; kode tanpa
// ilustrasi (501) tetap memakai ubin ikon.
const img = (name) => `/images/errors/${name}.webp`
export const ERROR_CODES = {
  400: {
    image: img('400'),
    name: 'Bad Request',
    title: 'Permintaan tidak valid',
    desc: 'Data yang dikirim tidak dapat diproses. Periksa kembali isian Anda, lalu coba lagi.',
    icon: CircleAlert,
    tone: 'warning',
    retry: true,
  },
  401: {
    image: img('401'),
    name: 'Unauthorized',
    title: 'Sesi Anda telah berakhir',
    desc: 'Silakan masuk kembali untuk melanjutkan. Demi keamanan, sesi otomatis berakhir setelah beberapa waktu tidak aktif.',
    icon: LockKeyhole,
    tone: 'info',
    login: true,
  },
  403: {
    image: img('403'),
    name: 'Forbidden',
    title: 'Akses ditolak',
    desc: 'Akun Anda tidak memiliki izin untuk membuka halaman ini. Hubungi admin LPPM bila Anda merasa seharusnya memiliki akses.',
    icon: ShieldX,
    tone: 'danger',
  },
  404: {
    image: img('404'),
    name: 'Not Found',
    title: 'Halaman tidak ditemukan',
    desc: 'Alamat yang Anda buka tidak ada atau sudah dipindahkan. Periksa kembali tautannya.',
    icon: FileQuestion,
    tone: 'info',
  },
  408: {
    image: img('408-504'),
    name: 'Request Timeout',
    title: 'Waktu permintaan habis',
    desc: 'Server terlalu lama merespons. Periksa koneksi internet Anda, lalu coba lagi.',
    icon: Hourglass,
    tone: 'warning',
    retry: true,
  },
  429: {
    image: img('429'),
    name: 'Too Many Requests',
    title: 'Terlalu banyak permintaan',
    desc: 'Anda mengirim terlalu banyak permintaan dalam waktu singkat. Tunggu beberapa menit sebelum mencoba lagi.',
    icon: Gauge,
    tone: 'warning',
    retry: true,
  },
  500: {
    image: img('500'),
    name: 'Internal Server Error',
    title: 'Terjadi kesalahan pada server',
    desc: 'Permintaan Anda tidak dapat diselesaikan karena gangguan di sisi kami. Coba lagi beberapa saat lagi.',
    icon: ServerCrash,
    tone: 'danger',
    retry: true,
  },
  501: {
    name: 'Not Implemented',
    title: 'Fitur belum diimplementasikan',
    desc: 'Fitur ini belum tersedia di sistem.',
    icon: Construction,
    tone: 'warning',
  },
  502: {
    image: img('502'),
    name: 'Bad Gateway',
    title: 'Server tidak dapat dihubungi',
    desc: 'Terjadi gangguan saat menghubungkan ke server LPPM. Coba lagi beberapa saat lagi.',
    icon: Unplug,
    tone: 'danger',
    retry: true,
  },
  503: {
    image: img('503'),
    name: 'Service Unavailable',
    title: 'Layanan sedang dalam pemeliharaan',
    desc: 'Sistem LPPM sedang diperbarui atau dipelihara. Silakan kembali beberapa saat lagi.',
    icon: Wrench,
    tone: 'info',
    retry: true,
  },
  504: {
    image: img('408-504'),
    name: 'Gateway Timeout',
    title: 'Server tidak merespons',
    desc: 'Server membutuhkan waktu terlalu lama untuk merespons. Coba lagi beberapa saat lagi.',
    icon: TimerOff,
    tone: 'warning',
    retry: true,
  },
}

export const errorFor = (code) => ERROR_CODES[code] || ERROR_CODES[500]
