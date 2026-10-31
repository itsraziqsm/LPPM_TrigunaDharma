import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { monitoringApi } from '../../api/monitoring'
import { laporanApi } from '../../api/laporan'
import { periodeApi } from '../../api/periode'
import { KepalaMasuk } from '../../components/PeriodeAktif'
import PanelCari, { PilihanFilter } from '../../components/PanelCari'
import KartuNavy from '../../components/KartuNavy'
import UserAvatar from '../../components/UserAvatar'
import { barisKlik } from '../../utils/barisKlik'
import { semuaHalaman } from '../../utils/semuaHalaman'
import useJejakMenu from '../../hooks/useJejakMenu'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from '../ProposalDosen/constants'

// ---------------------------------------------------------------------------
// Ketua STMIK › Akademik › Daftar Dokumen (hanya baca):
//   tipe 'proposal' (/daftar-dokumen/proposal) — GET /monitoring/proposals (semua halaman, tanpa draft):
//     proposal periode AKTIF + proposal yang masih BERJALAN di luar periode aktif
//     (bukan ditolak dan tahapan < pasca pelaksanaan). Baris → Detail Kegiatan (baca saja).
//   tipe 'laporan'  (/daftar-dokumen/laporan)  — GET /laporan (semua halaman, tanpa draft):
//     laporan periode aktif + laporan yang masih berjalan (diajukan/review/revisi) di luar
//     periode aktif. Baris → /laporan-masuk/detail/:id (mode baca Ketua STMIK).
// Filter (cakupan, status, jenis) & cari diterapkan di peramban; paginasi 10.
// ---------------------------------------------------------------------------

const PER_HALAMAN = 10
const rupiah = (v) => (v == null || v === '' ? '—' : `Rp ${Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`)
const nama = (u) => u?.fullName || u?.name || '—'
const periodeIdOf = (x) => x.periode?.id ?? x.periodeId
const waktu = (x) => new Date(x.submittedAt || x.updatedAt || x.createdAt || 0).getTime()

const CAKUPAN = [
  ['', 'Periode aktif & berjalan'],
  ['aktif', 'Periode aktif'],
  ['berjalan', 'Berjalan di luar periode aktif'],
]

const KONFIG = {
  proposal: {
    judul: 'Daftar Proposal',
    noun: 'proposal',
    desc: 'Proposal di periode aktif, ditambah proposal periode lain yang kegiatannya masih berjalan. Hanya baca.',
    muat: () => semuaHalaman(monitoringApi.proposals, { urut: 'terbaru' }),
    // Masih berjalan: belum ditolak & belum tahap pasca pelaksanaan.
    berjalan: (p) => p.status !== 'ditolak' && (Number(p.tahapan?.urutan) || 1) < 4,
    detail: (p) => `/kegiatan/${p.jenis}/detail/${p.id}`,
  },
  laporan: {
    judul: 'Daftar Laporan',
    noun: 'laporan',
    desc: 'Laporan kegiatan di periode aktif, ditambah laporan periode lain yang masih diproses. Hanya baca.',
    muat: () => semuaHalaman(laporanApi.getAll),
    berjalan: (l) => ['diajukan', 'review', 'revisi'].includes(l.status),
    detail: (l) => `/laporan-masuk/detail/${l.id}`,
  },
}

function Halaman({ page, pages, total, noun, onPage }) {
  if (pages <= 1) return null
  return (
    <nav aria-label="Halaman" className="flex items-center justify-between gap-3 text-sm text-slate-600">
      <span className="tabular-nums">
        Halaman {page} dari {pages} · {total} {noun}
      </span>
      <span className="flex gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Sebelumnya
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Berikutnya
        </button>
      </span>
    </nav>
  )
}

export default function DaftarDokumenStmikPage({ tipe = 'proposal' }) {
  const k = KONFIG[tipe]
  const induk = useJejakMenu('akademik')
  const navigate = useNavigate()
  const [periodes, setPeriodes] = useState(null)
  const [data, setData] = useState(null) // { items, terpotong }
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState({ cakupan: '', status: '', jenis: '' })
  const [page, setPage] = useState(1)

  useEffect(() => {
    let alive = true
    Promise.all([periodeApi.getAll({ limit: 100 }), k.muat()])
      .then(([rp, hasil]) => {
        if (!alive) return
        setPeriodes(rp.data.data || [])
        setData(hasil)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [k])

  // Bagi data: periode aktif / berjalan di luar periode aktif (sisanya tidak ditampilkan).
  const terbagi = useMemo(() => {
    const aktif = new Set((periodes || []).filter((p) => p.isAktif).map((p) => p.id))
    return (data?.items || [])
      .filter((x) => x.status !== 'draft')
      .map((x) => ({ ...x, _aktif: aktif.has(periodeIdOf(x)) }))
      .filter((x) => x._aktif || k.berjalan(x))
      .sort((a, b) => waktu(b) - waktu(a))
  }, [data, periodes, k])

  const q = query.toLowerCase()
  const tampil = terbagi.filter(
    (x) =>
      (!filter.cakupan || (filter.cakupan === 'aktif' ? x._aktif : !x._aktif)) &&
      (!filter.status || x.status === filter.status) &&
      (!filter.jenis || x.jenis === filter.jenis) &&
      (!q || [x.judul, nama(x.pengusul), x.pengusul?.nidn, x.periode?.nama].some((s) => String(s || '').toLowerCase().includes(q))),
  )
  const pages = Math.max(1, Math.ceil(tampil.length / PER_HALAMAN))
  const hal = Math.min(page, pages)
  const baris = tampil.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN)
  const ubah = (key, v) => {
    setFilter((f) => ({ ...f, [key]: v }))
    setPage(1)
  }
  const memuat = !failed && (periodes === null || data === null)
  const bukaDetail = (x) => navigate(k.detail(x), { state: { dari: { to: `/daftar-dokumen/${tipe}`, label: k.judul } } })

  return (
    <div className="page space-y-6">
      <KepalaMasuk
        judul={k.judul}
        crumbs={[...induk, { label: 'Daftar Dokumen' }, { label: k.judul }]}
        desc={k.desc}
        stats={[
          { label: 'Ditampilkan', value: memuat ? '…' : terbagi.length },
          { label: 'Periode aktif', value: memuat ? '…' : terbagi.filter((x) => x._aktif).length },
          { label: 'Berjalan di luar', value: memuat ? '…' : terbagi.filter((x) => !x._aktif).length },
        ]}
      />

      <PanelCari
        id={`stmik-${tipe}`}
        value={search}
        onChange={setSearch}
        onSubmit={() => {
          setQuery(search.trim())
          setPage(1)
        }}
        placeholder="Cari judul, nama atau NIDN pengusul, periode"
        aktif={[
          filter.cakupan ? { key: 'cakupan', label: CAKUPAN.find(([v]) => v === filter.cakupan)[1], onRemove: () => ubah('cakupan', '') } : null,
          filter.status ? { key: 'status', label: `Status: ${STATUS_LABEL[filter.status]}`, onRemove: () => ubah('status', '') } : null,
          filter.jenis ? { key: 'jenis', label: `Jenis: ${JENIS_LABEL[filter.jenis]}`, onRemove: () => ubah('jenis', '') } : null,
        ].filter(Boolean)}
        onReset={() => {
          setFilter({ cakupan: '', status: '', jenis: '' })
          setPage(1)
        }}
      >
        <div className="grid gap-4 @2xl:grid-cols-3">
          <PilihanFilter label="Cakupan" value={filter.cakupan} onChange={(v) => ubah('cakupan', v)} items={CAKUPAN} />
          <PilihanFilter
            label="Status"
            value={filter.status}
            onChange={(v) => ubah('status', v)}
            items={[['', 'Semua status'], ...['diajukan', 'review', 'revisi', 'disetujui', 'ditolak'].map((s) => [s, STATUS_LABEL[s]])]}
          />
          <PilihanFilter
            label="Jenis kegiatan"
            value={filter.jenis}
            onChange={(v) => ubah('jenis', v)}
            items={[['', 'Semua jenis'], ['penelitian', 'Penelitian'], ['pengabdian', 'Pengabdian']]}
          />
        </div>
      </PanelCari>

      <KartuNavy
        judul={k.judul}
        desc={`Klik baris untuk membuka detail ${k.noun} (baca saja).${data?.terpotong ? ' Data terlalu banyak; sebagian tidak dimuat.' : ''}`}
        badge={memuat ? '…' : `${tampil.length} ${k.noun}`}
      >
        {failed ? (
          <p className="px-6 py-12 text-center text-base text-red-600">Data {k.noun} gagal dimuat. Muat ulang halaman untuk mencoba lagi.</p>
        ) : memuat ? (
          <p className="flex items-center justify-center gap-3 px-6 py-12 text-base text-slate-500">
            <span className="spinner text-navy-600" aria-hidden="true" />
            Memuat {k.noun}…
          </p>
        ) : tampil.length === 0 ? (
          <p className="px-6 py-12 text-center text-base text-slate-500">Tidak ada {k.noun} yang cocok.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table-tight min-w-[860px]">
                <thead>
                  <tr>
                    <th scope="col">Judul</th>
                    <th scope="col">Pengusul</th>
                    <th scope="col">Periode</th>
                    <th scope="col">Status</th>
                    <th scope="col">{tipe === 'proposal' ? 'Tahapan' : 'Realisasi'}</th>
                    <th scope="col" className="text-right">
                      Anggaran
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {baris.map((x) => (
                    <tr key={x.id} {...barisKlik(() => bukaDetail(x), x.judul)}>
                      <td className="min-w-[16rem] max-w-[28rem]">
                        <p className="line-clamp-2 font-semibold leading-snug text-slate-900" title={x.judul}>
                          {x.judul}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="badge badge-tag">{JENIS_LABEL[x.jenis] || x.jenis || '—'}</span>
                          <span className="text-xs text-slate-500">ID #{x.id}</span>
                        </div>
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          <UserAvatar user={x.pengusul} className="size-7 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
                          <span className="min-w-0">
                            <span className="block font-medium text-slate-900">{nama(x.pengusul)}</span>
                            {x.pengusul?.nidn ? <span className="block text-xs text-slate-500">NIDN {x.pengusul.nidn}</span> : null}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="block text-slate-900">{x.periode?.nama || '—'}</span>
                        {x._aktif ? null : <span className="badge badge-neutral mt-1">Di luar periode aktif</span>}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_COLOR[x.status] || 'badge-neutral'}`}>{STATUS_LABEL[x.status] || x.status}</span>
                      </td>
                      <td className="text-sm text-slate-700">{tipe === 'proposal' ? x.tahapan?.label || '—' : rupiah(x.realisasiAnggaran)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums text-slate-900">{rupiah(x.anggaran)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Halaman page={hal} pages={pages} total={tampil.length} noun={k.noun} onPage={setPage} />
          </>
        )}
      </KartuNavy>
    </div>
  )
}
