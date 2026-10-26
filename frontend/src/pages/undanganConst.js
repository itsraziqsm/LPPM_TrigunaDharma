// Konstanta bersama halaman Undangan (daftar & detail).
export const UNDANGAN_STATUS_COLOR = {
  pending: 'badge-warning',
  diterima: 'badge-success',
  ditolak: 'badge-danger',
}

export const UNDANGAN_STATUS_LABEL = {
  pending: 'Menunggu Respons',
  diterima: 'Diterima',
  ditolak: 'Ditolak',
}

// Dosen: "Undangan Kerja Sama"; mahasiswa: "Undangan Ikut Serta".
export const judulUndangan = (peranPertama) =>
  peranPertama === 'mahasiswa' ? 'Undangan Ikut Serta' : 'Undangan Kerja Sama'

export const tanggalPanjang = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
