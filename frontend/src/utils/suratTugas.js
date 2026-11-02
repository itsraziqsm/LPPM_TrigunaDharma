import { cetakApi } from '../api/cetak'

// Surat Tugas bernomor otomatis (W-42): setiap cetak = POST /surat-tugas (nomor 001/ST/LPPM/<romawi>/<tahun> + arsip),
// lalu PDF memakai nomor dari respons. Arsip bisa dicetak ulang dengan nomor yang sama (tanpa POST baru).

// Konfigurasi halaman Surat Tugas (petugas tercentang saja) → body POST /surat-tugas.
export function bodySuratTugas(data) {
  return {
    kegiatanId: Number(data.kegiatan?.id || data.kegiatanId),
    tugas: String(data.tugas || '').trim(),
    petugas: (data.petugas || []).map((p) => ({ nama: p.nama || '', identitas: p.identitas || '', peran: p.peran || '' })),
    tanggalMulai: data.tanggalMulai,
    ...(data.tanggalSelesai ? { tanggalSelesai: data.tanggalSelesai } : {}),
    alamat: String(data.alamat || '').trim(),
    penandatangan: { nama: data.penandatangan?.nama || '', nidn: data.penandatangan?.nidn || '', jabatan: data.penandatangan?.jabatan || '' },
  }
}

// Terbitkan nomor + arsip; kembalikan data siap cetak (cfg + nomor resmi).
export async function terbitkanSuratTugas(data) {
  const r = await cetakApi.buatSuratTugas(bodySuratTugas(data))
  const s = r.data.data || {}
  return { surat: s, cetak: { ...data, nomor: s.nomor || data.nomor, tanggalSurat: (s.createdAt || '').slice(0, 10) || data.tanggalSurat } }
}

// Item arsip → data PDF (cetak ulang).
export function cetakDariArsip(s, kota = 'Medan') {
  return {
    nomor: s.nomor,
    tugas: s.tugas,
    kegiatan: { tipe: s.tipe, jenis: s.jenis, judul: s.judulKegiatan, periode: '' },
    petugas: s.petugas || [],
    tanggalMulai: s.tanggalMulai,
    tanggalSelesai: s.tanggalSelesai,
    alamat: s.alamat,
    kota,
    tanggalSurat: (s.createdAt || '').slice(0, 10),
    penandatangan: s.penandatangan || {},
  }
}

// Pesan galat server (400 per field) jadi satu kalimat.
export const pesanSurat = (e, cadangan) => (e?.response?.data?.errors ? Object.values(e.response.data.errors).flat().join(' ') : e?.response?.data?.message || cadangan)
