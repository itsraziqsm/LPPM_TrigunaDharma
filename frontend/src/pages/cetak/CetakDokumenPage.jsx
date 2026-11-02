import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Award, CircleCheck, Download, CircleDashed, FileSpreadsheet, FileSignature, Printer, Settings2, Users } from 'lucide-react'
import { exportApi } from '../../api/export'
import { exportToPDF } from '../../utils/exportPDF'
import { alertDialog } from '../../utils/dialog'
import { loadCetakConfig, muatCetakConfig } from '../../utils/cetakConfig'
import { pesanSurat, terbitkanSuratTugas } from '../../utils/suratTugas'
import { suratTugasPDF } from '../../utils/suratTugasPDF'
import useAuthStore from '../../store/authStore'
import { getRoleNames } from '../../utils/roles'
import { LUARAN_KEY, PENGGUNA_KEY, REKAP_KEY, SURAT_TUGAS_KEY, luaranRingkas, penggunaRingkas, rekapRingkas, suratTugasData } from './dokumen'
import { ambilPengguna, penggunaPDF } from './cetakPengguna'
import { pesanBlob, unduhLuaran } from './cetakLuaran'
import { KepalaMasuk } from '../../components/PeriodeAktif'
import useJejakMenu from '../../hooks/useJejakMenu'
import { batalTab, siapkanTab } from '../../utils/pratinjauPdf'

// ---------------------------------------------------------------------------
// Cetak Dokumen (Admin & Ketua LPPM, route /cetak-dokumen; dulu Export/Print
// Laporan di /export). Wadah kartu dokumen: status konfigurasi, tombol Cetak,
// tombol Konfigurasi (ke halaman konfigurasi masing-masing).
//   1. Rekapitulasi Proposal → /cetak-dokumen/rekap-proposal (halaman export lama)
//   2. Surat Tugas           → /cetak-dokumen/surat-tugas
//   3. Tabel Pengguna        → /cetak-dokumen/tabel-pengguna (semua / pilih peran)
//   4. Luaran Dosen (Ketua)  → /cetak-dokumen/luaran-dosen (ZIP bukti &/atau CSV + filter)
// Konfigurasi bersama di server (utils/cetakConfig → /cetak/konfigurasi/:dokumen, W-42; cache peramban). Cetak Surat
// Tugas = POST /surat-tugas (nomor otomatis + arsip) lalu PDF bernomor.
// ---------------------------------------------------------------------------

const waktu = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function StatusBadge({ ready, readyText, emptyText }) {
  return ready ? (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
      <CircleCheck className="size-4" aria-hidden="true" />
      {readyText}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
      <CircleDashed className="size-4" aria-hidden="true" />
      {emptyText}
    </span>
  )
}

function DokumenCard({ icon: Icon, title, desc, status, detail, configureTo, onPrint, printing, printDisabled, printHint, printLabel = 'Cetak', PrintIcon = Printer }) {
  return (
    <li className="card flex flex-col">
      <div className="flex items-start gap-4 px-6 pt-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-navy-800 text-white">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-navy-950">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{desc}</p>
        </div>
      </div>
      <dl className="mx-6 mt-5 space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-slate-500">Status konfigurasi</dt>
          <dd>{status}</dd>
        </div>
        {detail ? (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-500">Isi</dt>
            <dd className="min-w-0 text-right text-slate-800">{detail}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-auto flex flex-wrap items-center gap-2 px-6 pb-6 pt-5">
        <button type="button" onClick={onPrint} disabled={printing || printDisabled} className="btn btn-primary" title={printHint}>
          {printing ? <span className="spinner" aria-hidden="true" /> : <PrintIcon className="size-4" aria-hidden="true" />}
          {printing ? 'Menyiapkan…' : printLabel}
        </button>
        <Link to={configureTo} className="btn btn-secondary">
          <Settings2 className="size-4" aria-hidden="true" />
          Konfigurasi
        </Link>
        {printDisabled && printHint ? <p className="w-full text-xs text-slate-500">{printHint}</p> : null}
      </div>
    </li>
  )
}

export default function CetakDokumenPage() {
  const location = useLocation()
  const [flash] = useState(() => location.state?.flash || null)
  const [rekap, setRekap] = useState(() => loadCetakConfig(REKAP_KEY))
  const [surat, setSurat] = useState(() => loadCetakConfig(SURAT_TUGAS_KEY))
  const [pengguna, setPengguna] = useState(() => loadCetakConfig(PENGGUNA_KEY))
  const [luaran, setLuaran] = useState(() => loadCetakConfig(LUARAN_KEY))
  useEffect(() => {
    let alive = true
    Promise.all([REKAP_KEY, SURAT_TUGAS_KEY, PENGGUNA_KEY, LUARAN_KEY].map((k) => muatCetakConfig(k))).then(([a, b, c, d]) => {
      if (!alive) return
      setRekap(a)
      setSurat(b)
      setPengguna(c)
      setLuaran(d)
    })
    return () => {
      alive = false
    }
  }, [])
  const [printing, setPrinting] = useState('')
  // Luaran Dosen (GET /luaran/unduh-*) hanya untuk Ketua LPPM (Admin dicabut); backend terbuka untuk
  // admin & Ketua LPPM (W-44).
  const isKetua = getRoleNames(useAuthStore((st) => st.user)?.roles)[0] === 'ketua_lppm'
  const induk = useJejakMenu('dokumentasi')
  // Konfigurasi tersimpan per kartu yang tampil (untuk kotak ringkasan).
  const konfigurasi = [rekap, surat, pengguna, ...(isKetua ? [luaran] : [])]

  const cetakPengguna = async () => {
    setPrinting('pengguna')
    siapkanTab()
    try {
      const users = await ambilPengguna(pengguna)
      if (!users.length) {
        batalTab()
        alertDialog({ tone: 'info', title: 'Tidak ada data', message: 'Tidak ada pengguna dengan peran terpilih.' })
        return
      }
      penggunaPDF(users, penggunaRingkas(pengguna))
    } catch {
      batalTab()
      alertDialog({ title: 'Gagal mencetak tabel pengguna', message: 'Data pengguna tidak dapat dimuat. Coba lagi.' })
    } finally {
      setPrinting('')
    }
  }

  const cetakLuaran = async () => {
    setPrinting('luaran')
    try {
      await unduhLuaran(luaran)
    } catch (e) {
      alertDialog({
        title: 'Unduhan gagal',
        message: e.response?.status === 403 ? 'Anda tidak memiliki akses untuk mengunduh luaran.' : await pesanBlob(e, 'File tidak dapat diunduh. Coba lagi.'),
      })
    } finally {
      setPrinting('')
    }
  }

  const cetakRekap = async () => {
    setPrinting('rekap')
    siapkanTab()
    try {
      const params = {}
      ;['periodeId', 'jenis', 'status', 'tahun'].forEach((k) => {
        if (rekap?.[k]) params[k] = rekap[k]
      })
      const res = await exportApi.getProposals(params)
      const data = res.data.data
      if (!data || data.total === 0) {
        batalTab()
        alertDialog({ tone: 'info', title: 'Tidak ada data', message: 'Tidak ada proposal yang cocok dengan konfigurasi rekap. Ubah konfigurasi lalu coba lagi.' })
        return
      }
      exportToPDF(data, { periodeNama: rekap?.periodeNama || '', jenis: rekap?.jenis || '', status: rekap?.status || '', tahun: rekap?.tahun || '' })
    } catch {
      batalTab()
      alertDialog({ title: 'Gagal mencetak rekap', message: 'Data rekapitulasi tidak dapat dimuat. Coba lagi.' })
    } finally {
      setPrinting('')
    }
  }

  // Setiap cetak menerbitkan nomor baru + arsip (POST /surat-tugas).
  const cetakSurat = async () => {
    if (!surat) return
    siapkanTab()
    setPrinting('surat')
    try {
      const { cetak } = await terbitkanSuratTugas(suratTugasData(surat))
      suratTugasPDF(cetak)
    } catch (e) {
      batalTab()
      alertDialog({ title: 'Gagal membuat surat tugas', message: pesanSurat(e, 'Periksa konfigurasi lalu coba lagi.') })
    } finally {
      setPrinting('')
    }
  }

  return (
    <div className="page space-y-6">
      {/* Kepala standar (M2) */}
      <KepalaMasuk
        judul="Cetak Dokumen"
        crumbs={[...induk, { label: 'Cetak Dokumen' }]}
        desc="Atur konfigurasi tiap dokumen, lalu cetak sebagai PDF atau unduh filenya."
        stats={[
          { label: 'Jenis dokumen', value: konfigurasi.length },
          { label: 'Dikonfigurasi', value: konfigurasi.filter(Boolean).length },
          { label: 'Memakai bawaan', value: konfigurasi.filter((c) => !c).length },
        ]}
      />

      {flash ? (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {flash}
        </div>
      ) : null}

      <hr className="pemisah" />

      <ul className="grid gap-5 lg:grid-cols-2">
        <DokumenCard
          icon={FileSpreadsheet}
          title="Export Rekapitulasi Proposal"
          desc="Rekap proposal per periode, jenis, dan status — PDF (cetak) atau Excel dari halaman konfigurasi."
          status={<StatusBadge ready={Boolean(rekap)} readyText={`Dikonfigurasi · ${waktu(rekap?.savedAt)}${rekap?.savedBy ? ` · ${rekap.savedBy}` : ''}`} emptyText="Bawaan (semua data)" />}
          detail={rekapRingkas(rekap)}
          configureTo="/cetak-dokumen/rekap-proposal"
          onPrint={cetakRekap}
          printing={printing === 'rekap'}
        />
        <DokumenCard
          icon={FileSignature}
          title="Buat Surat Tugas"
          desc="Surat tugas untuk tim pengusul berdasarkan proposal atau laporan kegiatan."
          status={<StatusBadge ready={Boolean(surat)} readyText={`Dikonfigurasi · ${waktu(surat?.savedAt)}${surat?.savedBy ? ` · ${surat.savedBy}` : ''}`} emptyText="Belum dikonfigurasi" />}
          detail={surat?.kegiatan ? `${surat.kegiatan.judul}${surat.nomor ? ` · No. ${surat.nomor}` : ''}` : null}
          configureTo="/cetak-dokumen/surat-tugas"
          onPrint={cetakSurat}
          printing={printing === 'surat'}
          printDisabled={!surat}
          printHint={!surat ? 'Konfigurasi surat tugas dulu (pilih kegiatan, tugas, tanggal, tempat).' : undefined}
        />
        <DokumenCard
          icon={Users}
          title="Cetak Tabel Pengguna"
          desc="Daftar pengguna (nama, email, NIDN/NIM, peran, status, prodi, kontak) sebagai PDF."
          status={<StatusBadge ready={Boolean(pengguna)} readyText={`Dikonfigurasi · ${waktu(pengguna?.savedAt)}`} emptyText="Bawaan (semua peran)" />}
          detail={penggunaRingkas(pengguna)}
          configureTo="/cetak-dokumen/tabel-pengguna"
          onPrint={cetakPengguna}
          printing={printing === 'pengguna'}
        />
        {isKetua ? (
          <DokumenCard
            icon={Award}
            title="Luaran Dosen"
            desc="Unduh semua bukti luaran (ZIP) dan/atau rekap CSV, maksimal 1000 luaran per unduhan."
            status={<StatusBadge ready={Boolean(luaran)} readyText={`Dikonfigurasi · ${waktu(luaran?.savedAt)}`} emptyText="Bawaan (ZIP + CSV, semua luaran)" />}
            detail={luaranRingkas(luaran)}
            configureTo="/cetak-dokumen/luaran-dosen"
            onPrint={cetakLuaran}
            printing={printing === 'luaran'}
            printLabel="Unduh"
            PrintIcon={Download}
          />
        ) : null}
      </ul>

      <p className="text-xs text-slate-500">
        Konfigurasi tersimpan di server dan sama untuk semua Admin & Ketua LPPM. Setiap cetak Surat Tugas mendapat nomor otomatis dan tercatat di arsip.
      </p>
    </div>
  )
}
