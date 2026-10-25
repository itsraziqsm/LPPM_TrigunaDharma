import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, RotateCcw, Save } from 'lucide-react'
import { proposalApi } from '../../api/proposal'
import { laporanApi } from '../../api/laporan'
import { periodeApi } from '../../api/periode'
import useAuthStore from '../../store/authStore'
import ApiPending from '../../components/ApiPending'
import { FieldError, Required } from '../../components/Wizard'
import { alertDialog, confirmDialog } from '../../utils/dialog'
import { clearCetakConfig, loadCetakConfig, saveCetakConfig } from '../../utils/cetakConfig'
import { suratTugasPDF } from '../../utils/suratTugasPDF'
import CetakBreadcrumb from './CetakBreadcrumb'
import { SURAT_TUGAS_KEY, suratTugasData } from './dokumen'

// ---------------------------------------------------------------------------
// Konfigurasi "Surat Tugas" (Cetak Dokumen → Surat Tugas → Konfigurasi).
// Admin/Ketua memilih kegiatan (proposal disetujui atau laporan); isian
// diwarisi dari identitasnya lalu bisa diubah:
//   tugas    ← jenis & tipe kegiatan
//   kegiatan ← judul, jenis, periode, pengusul + anggota (yang ditugaskan)
//   tanggal  ← tanggalMulai/tanggalSelesai periode (GET /periode/:id)
//   alamat   ← alamat mitra (pengabdian) atau kampus
// Data: GET /proposals?status=disetujui, GET /laporan, GET /proposals/:id,
// GET /laporan/:id. Konfigurasi & nomor surat belum punya endpoint → disimpan di
// peramban (utils/cetakConfig, ApiPending W-32). PDF dibuat di frontend (jspdf).
// ---------------------------------------------------------------------------

const KAMPUS = 'Kampus STMIK Triguna Dharma, Jl. A.H. Nasution No. 73 F, Medan'

const EMPTY = {
  tipe: 'proposal',
  kegiatanId: '',
  kegiatan: null, // { tipe, id, jenis, judul, periode }
  tugas: '',
  petugas: [], // { key, nama, identitas, peran, ikut }
  tanggalMulai: '',
  tanggalSelesai: '',
  alamat: '',
  nomor: '',
  kota: 'Medan',
  tanggalSurat: new Date().toISOString().slice(0, 10),
  penandatangan: { nama: '', nidn: '', jabatan: 'Ketua LPPM' },
}

function tugasDefault(tipe, jenis) {
  if (tipe === 'laporan') return `menyusun dan menyampaikan laporan hasil ${jenis === 'pengabdian' ? 'pengabdian kepada masyarakat' : 'penelitian'}`
  return jenis === 'pengabdian' ? 'melaksanakan kegiatan pengabdian kepada masyarakat' : 'melaksanakan kegiatan penelitian'
}

// "Nama (Tahun)", tanpa tahun ganda bila nama periode sudah memuatnya.
const periodeLabel = (p) => (p ? (String(p.nama).includes(String(p.tahun)) ? p.nama : `${p.nama} (${p.tahun})`) : '')

const d10 = (v) => (v ? String(v).slice(0, 10) : '')

function validate(cfg) {
  const e = {}
  if (!cfg.kegiatan) e.kegiatan = 'Pilih kegiatan yang ditugaskan.'
  if (!cfg.tugas.trim()) e.tugas = 'Isi tugas yang diberikan.'
  if (!cfg.petugas.some((p) => p.ikut)) e.petugas = 'Pilih minimal satu orang yang ditugaskan.'
  if (!cfg.tanggalMulai) e.tanggalMulai = 'Isi tanggal mulai.'
  if (cfg.tanggalSelesai && cfg.tanggalMulai && cfg.tanggalSelesai < cfg.tanggalMulai) e.tanggalSelesai = 'Tanggal selesai sebelum tanggal mulai.'
  if (!cfg.alamat.trim()) e.alamat = 'Isi tempat/alamat pelaksanaan.'
  if (!cfg.penandatangan.nama.trim()) e.penandatangan = 'Isi nama penandatangan.'
  return e
}

export default function SuratTugasPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [cfg, setCfg] = useState(() => {
    const saved = loadCetakConfig(SURAT_TUGAS_KEY)
    if (saved) return { ...EMPTY, ...saved, penandatangan: { ...EMPTY.penandatangan, ...saved.penandatangan } }
    return EMPTY
  })
  const [options, setOptions] = useState({ proposal: null, laporan: null })
  const [inheriting, setInheriting] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [msg, setMsg] = useState(null)

  // Penandatangan default: Ketua LPPM yang sedang masuk.
  useEffect(() => {
    const roles = (user?.roles || []).map((r) => (typeof r === 'string' ? r : r.role?.name || r.name))
    if (roles.includes('ketua_lppm') && !cfg.penandatangan.nama) {
      setCfg((c) => ({ ...c, penandatangan: { ...c.penandatangan, nama: user.fullName || user.name || '', nidn: user.nidn || '' } }))
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pilihan kegiatan: proposal disetujui & laporan (semua status kecuali draft).
  useEffect(() => {
    proposalApi
      .getAll({ status: 'disetujui', limit: 100 })
      .then((r) => setOptions((o) => ({ ...o, proposal: r.data.data || [] })))
      .catch(() => setOptions((o) => ({ ...o, proposal: [] })))
    laporanApi
      .getAll({ limit: 100 })
      .then((r) => setOptions((o) => ({ ...o, laporan: (r.data.data || []).filter((l) => l.status !== 'draft') })))
      .catch(() => setOptions((o) => ({ ...o, laporan: [] })))
  }, [])

  const errors = useMemo(() => validate(cfg), [cfg])
  const err = (k) => (showErrors ? errors[k] : null)
  const set = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.value }))
  const setTtd = (k) => (e) => setCfg((c) => ({ ...c, penandatangan: { ...c.penandatangan, [k]: e.target.value } }))

  // Warisi identitas kegiatan terpilih.
  const pilihKegiatan = async (tipe, id) => {
    setCfg((c) => ({ ...c, tipe, kegiatanId: id }))
    if (!id) return
    setInheriting(true)
    setMsg(null)
    try {
      const item = (tipe === 'laporan' ? await laporanApi.getById(id) : await proposalApi.getById(id)).data.data
      let periode = null
      if (item.periode?.id) periode = await periodeApi.getById(item.periode.id).then((r) => r.data.data).catch(() => null)
      const petugas = [
        { key: `u${item.pengusul?.id}`, nama: item.pengusul?.fullName || item.pengusul?.name, identitas: item.pengusul?.nidn || '', peran: 'Ketua pengusul', ikut: true },
        ...(item.anggota || [])
          .filter((a) => !a.statusUndangan || a.statusUndangan === 'diterima')
          .map((a) => ({
            key: `a${a.id}`,
            nama: a.user?.fullName || a.user?.name,
            identitas: a.user?.nidn || a.user?.nim || '',
            peran: a.peran ? a.peran.charAt(0).toUpperCase() + a.peran.slice(1) : 'Anggota',
            ikut: true,
          })),
      ]
      const alamat =
        item.jenis === 'pengabdian' && (item.mitraAlamat || item.mitra)
          ? [item.mitra, item.mitraAlamat].filter(Boolean).join(', ')
          : KAMPUS
      setCfg((c) => ({
        ...c,
        tipe,
        kegiatanId: id,
        kegiatan: {
          tipe,
          id: item.id,
          jenis: item.jenis,
          judul: item.judul,
          periode: periodeLabel(periode || item.periode),
        },
        tugas: tugasDefault(tipe, item.jenis),
        petugas,
        tanggalMulai: d10(periode?.tanggalMulai) || c.tanggalMulai,
        tanggalSelesai: d10(periode?.tanggalSelesai) || c.tanggalSelesai,
        alamat,
      }))
      setMsg({ ok: true, text: 'Isian diwarisi dari identitas kegiatan. Periksa dan ubah bila perlu.' })
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.message || 'Data kegiatan gagal dimuat.' })
    } finally {
      setInheriting(false)
    }
  }

  const simpan = (andPrint) => {
    setShowErrors(true)
    if (Object.keys(errors).length) {
      setMsg({ ok: false, text: 'Lengkapi isian yang ditandai.' })
      return
    }
    const saved = saveCetakConfig(SURAT_TUGAS_KEY, cfg)
    setCfg(saved)
    if (andPrint) {
      try {
        suratTugasPDF(suratTugasData(saved))
      } catch {
        alertDialog({ title: 'Gagal membuat PDF', message: 'Silakan coba lagi.' })
        return
      }
      setMsg({ ok: true, text: 'Konfigurasi disimpan dan surat tugas diunduh.' })
    } else {
      navigate('/cetak-dokumen', { state: { flash: 'Konfigurasi Surat Tugas disimpan.' } })
    }
  }

  const reset = async () => {
    if (!(await confirmDialog({ tone: 'danger', title: 'Atur ulang konfigurasi?', message: 'Semua isian Surat Tugas dikosongkan.', confirmText: 'Ya, atur ulang' }))) return
    clearCetakConfig(SURAT_TUGAS_KEY)
    setCfg(EMPTY)
    setShowErrors(false)
    setMsg(null)
  }

  const list = options[cfg.tipe]

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="page-title">Konfigurasi Surat Tugas</h1>
          <p className="page-desc">Pilih kegiatan; tugas, petugas, tanggal, dan tempat diwarisi dari identitas proposal atau laporan.</p>
        </div>
        <CetakBreadcrumb last="Surat Tugas" />
      </header>

      {msg ? (
        <div
          role={msg.ok ? 'status' : 'alert'}
          className={`rounded-lg border px-4 py-3 text-sm ${msg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}
        >
          {msg.text}
        </div>
      ) : null}

      {/* 1. Kegiatan */}
      <section className="card">
        <header className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-navy-950">1. Kegiatan</h2>
          <p className="text-sm text-slate-500">Sumber identitas surat: proposal yang disetujui atau laporan kegiatan.</p>
        </header>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <div>
            <span className="label">Sumber</span>
            <div role="radiogroup" className="flex gap-2">
              {['proposal', 'laporan'].map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={cfg.tipe === t}
                  onClick={() => setCfg((c) => ({ ...c, tipe: t, kegiatanId: '' }))}
                  className={`btn btn-sm flex-1 ${cfg.tipe === t ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {t === 'proposal' ? 'Proposal' : 'Laporan'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="st-kegiatan" className="label">
              Kegiatan
              <Required />
            </label>
            <select
              id="st-kegiatan"
              className="input"
              value={cfg.kegiatanId}
              disabled={list === null || inheriting}
              onChange={(e) => pilihKegiatan(cfg.tipe, e.target.value)}
            >
              <option value="">{list === null ? 'Memuat…' : `-- Pilih ${cfg.tipe === 'laporan' ? 'laporan' : 'proposal disetujui'} --`}</option>
              {cfg.kegiatan && cfg.kegiatan.tipe === cfg.tipe && !(list || []).some((x) => String(x.id) === String(cfg.kegiatanId)) ? (
                <option value={cfg.kegiatanId}>{cfg.kegiatan.judul}</option>
              ) : null}
              {(list || []).map((x) => (
                <option key={x.id} value={x.id}>
                  [{x.jenis === 'pengabdian' ? 'Pengabdian' : 'Penelitian'}] {x.judul}
                </option>
              ))}
            </select>
            {inheriting ? <p className="mt-1.5 text-xs text-slate-500">Mewarisi data kegiatan…</p> : <FieldError message={err('kegiatan')} />}
            {cfg.kegiatan ? (
              <p className="mt-2 text-sm text-slate-600">
                {cfg.kegiatan.jenis === 'pengabdian' ? 'Pengabdian' : 'Penelitian'} · {cfg.kegiatan.tipe === 'laporan' ? 'Laporan' : 'Proposal'} #
                {cfg.kegiatan.id}
                {cfg.kegiatan.periode ? ` · ${cfg.kegiatan.periode}` : ''}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* 2. Tugas & petugas */}
      <section className="card">
        <header className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-navy-950">2. Tugas & yang ditugaskan</h2>
        </header>
        <div className="space-y-5 px-6 py-5">
          <div>
            <label htmlFor="st-tugas" className="label">
              Tugas
              <Required />
            </label>
            <input id="st-tugas" className="input" value={cfg.tugas} onChange={set('tugas')} placeholder="mis. melaksanakan kegiatan penelitian" />
            {err('tugas') ? <FieldError message={err('tugas')} /> : <p className="mt-1.5 text-xs text-slate-500">Dicetak: "Untuk {cfg.tugas || '…'} pada kegiatan …"</p>}
          </div>
          <div>
            <span className="label">
              Yang ditugaskan
              <Required />
            </span>
            {cfg.petugas.length === 0 ? (
              <p className="text-sm text-slate-500">Pilih kegiatan untuk mengisi daftar dari pengusul & anggota tim.</p>
            ) : (
              <div className="table-wrap">
                <table className="table table-tight">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="sr-only">Ikut</span>
                      </th>
                      <th scope="col">Nama</th>
                      <th scope="col">NIDN / NIM</th>
                      <th scope="col">Peran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cfg.petugas.map((p) => (
                      <tr key={p.key}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Tugaskan ${p.nama}`}
                            className="size-4 accent-navy-700"
                            checked={p.ikut}
                            onChange={(e) => setCfg((c) => ({ ...c, petugas: c.petugas.map((x) => (x.key === p.key ? { ...x, ikut: e.target.checked } : x)) }))}
                          />
                        </td>
                        <td className="font-medium text-slate-900">{p.nama}</td>
                        <td>
                          <input
                            className="input min-h-9 py-1.5 text-sm"
                            aria-label={`NIDN/NIM ${p.nama}`}
                            value={p.identitas}
                            onChange={(e) => setCfg((c) => ({ ...c, petugas: c.petugas.map((x) => (x.key === p.key ? { ...x, identitas: e.target.value } : x)) }))}
                          />
                        </td>
                        <td>{p.peran}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <FieldError message={err('petugas')} />
          </div>
        </div>
      </section>

      {/* 3. Waktu & tempat */}
      <section className="card">
        <header className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-navy-950">3. Waktu & tempat</h2>
          <p className="text-sm text-slate-500">Tanggal dari periode kegiatan; tempat dari alamat mitra (pengabdian) atau kampus.</p>
        </header>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div>
            <label htmlFor="st-mulai" className="label">
              Tanggal mulai
              <Required />
            </label>
            <input id="st-mulai" type="date" className="input" value={cfg.tanggalMulai} onChange={set('tanggalMulai')} />
            <FieldError message={err('tanggalMulai')} />
          </div>
          <div>
            <label htmlFor="st-selesai" className="label">
              Tanggal selesai
            </label>
            <input id="st-selesai" type="date" className="input" value={cfg.tanggalSelesai} onChange={set('tanggalSelesai')} />
            <FieldError message={err('tanggalSelesai')} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="st-alamat" className="label">
              Tempat / alamat
              <Required />
            </label>
            <textarea id="st-alamat" rows={2} className="input resize-y" value={cfg.alamat} onChange={set('alamat')} />
            <FieldError message={err('alamat')} />
          </div>
        </div>
      </section>

      {/* 4. Surat */}
      <section className="card">
        <header className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-navy-950">4. Nomor & penandatangan</h2>
        </header>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div>
            <label htmlFor="st-nomor" className="label">
              Nomor surat
            </label>
            <input id="st-nomor" className="input" value={cfg.nomor} onChange={set('nomor')} placeholder="mis. 012/LPPM/ST/X/2026" />
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              Diisi manual. Penomoran otomatis & arsip surat: <ApiPending />
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="st-kota" className="label">
                Kota
              </label>
              <input id="st-kota" className="input" value={cfg.kota} onChange={set('kota')} />
            </div>
            <div>
              <label htmlFor="st-tgl" className="label">
                Tanggal surat
              </label>
              <input id="st-tgl" type="date" className="input" value={cfg.tanggalSurat} onChange={set('tanggalSurat')} />
            </div>
          </div>
          <div>
            <label htmlFor="st-ttd" className="label">
              Penandatangan
              <Required />
            </label>
            <input id="st-ttd" className="input" value={cfg.penandatangan.nama} onChange={setTtd('nama')} placeholder="Nama lengkap & gelar" />
            <FieldError message={err('penandatangan')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="st-jabatan" className="label">
                Jabatan
              </label>
              <input id="st-jabatan" className="input" value={cfg.penandatangan.jabatan} onChange={setTtd('jabatan')} />
            </div>
            <div>
              <label htmlFor="st-nidn" className="label">
                NIDN
              </label>
              <input id="st-nidn" className="input" value={cfg.penandatangan.nidn} onChange={setTtd('nidn')} />
            </div>
          </div>
        </div>
      </section>

      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        Konfigurasi disimpan di peramban ini. Simpan di server agar sama di semua perangkat: <ApiPending />
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Link to="/cetak-dokumen" className="btn btn-secondary">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Kembali
        </Link>
        <button type="button" onClick={reset} className="btn btn-ghost text-red-700">
          <RotateCcw className="size-4" aria-hidden="true" />
          Atur ulang
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => simpan(false)} className="btn btn-secondary">
          <Save className="size-4" aria-hidden="true" />
          Simpan konfigurasi
        </button>
        <button type="button" onClick={() => simpan(true)} className="btn btn-primary">
          <Printer className="size-4" aria-hidden="true" />
          Simpan & cetak
        </button>
      </div>
    </div>
  )
}
