import { useEffect, useState, useCallback } from 'react'
import { proposalDosenApi } from '../api/Proposaldosen'
import { refreshInvitationBadge } from '../components/Sidebar'
import { Link } from 'react-router-dom'
import { ArrowRight, Users } from 'lucide-react'
import useAuthStore from '../store/authStore'
import { getRoleNames } from '../utils/roles'
import Breadcrumb from '../components/Breadcrumb'
import { UNDANGAN_STATUS_COLOR as STATUS_COLOR, UNDANGAN_STATUS_LABEL as STATUS_LABEL, judulUndangan, tanggalPanjang } from './undanganConst'

// ── Konstanta ─────────────────────────────────────────────────────────────────

const JENIS_LABEL = { penelitian: 'Penelitian', pengabdian: 'Pengabdian' }

// ── Komponen kecil ────────────────────────────────────────────────────────────

function Badge({ label, className }) {
  return <span className={`badge ${className}`}>{label}</span>
}

function EmptyState({ judul }) {
  return (
    <section className="flex flex-col items-center justify-center px-6 py-16 text-center sm:px-10">
      <div className="mb-5 grid size-12 place-items-center rounded-full bg-navy-50 text-navy-600">
        <Users className="size-6" strokeWidth={1.5} aria-hidden="true" />
      </div>

      <h2 className="text-lg font-semibold text-navy-950">Belum ada {judul.toLowerCase()}</h2>
      <p className="mt-1.5 max-w-md text-base leading-relaxed text-slate-500">
        Anda akan menerima undangan ketika ditambahkan sebagai anggota tim proposal oleh pengusul.
      </p>
    </section>
  )
}

// ── Kartu Undangan ────────────────────────────────────────────────────────────

function UndanganCard({ undangan: u, onRespond, responding }) {
  const [msg, setMsg] = useState('')
  const isPending = u.statusUndangan === 'pending'

  const handle = async (status) => {
    setMsg('')
    await onRespond(u.id, status, (m) => setMsg(m))
  }

  return (
    <article className="card overflow-hidden">
      {/* Layout utama: informasi proposal + panel tindakan */}
      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <header>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Badge
                label={STATUS_LABEL[u.statusUndangan] || u.statusUndangan}
                className={`${STATUS_COLOR[u.statusUndangan] || 'badge-neutral'}`}
              />
              <Badge label={JENIS_LABEL[u.proposal.jenis] || u.proposal.jenis} className="badge-plain" />
              <Badge label={`Peran Tim: ${u.peran}`} className="badge-plain" />
            </div>

            <h3 className="mt-3 text-lg font-semibold leading-snug text-navy-950">
              {u.proposal.judul}
            </h3>
            <p className="mt-1.5 text-base leading-relaxed text-slate-600">
              Proposal ini diajukan oleh{' '}
              <span className="font-semibold text-slate-900">
                {u.proposal.pengusul.fullName || u.proposal.pengusul.name}
              </span>
              {u.proposal.periode && (
                <span>
                  {' '}
                  untuk periode {u.proposal.periode.nama} {u.proposal.periode.tahun}
                </span>
              )}
            </p>
            {/* Detail undangan = informasi kegiatan terkait (/undangan/:id) */}
            <Link to={`/undangan/${u.id}`} className="btn btn-secondary btn-sm mt-4">
              Lihat kegiatan
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </header>

          <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-slate-500">Status Undangan</dt>
              <dd className="mt-0.5 text-base font-semibold text-slate-900">
                {STATUS_LABEL[u.statusUndangan] || u.statusUndangan}
              </dd>
            </div>

            <div>
              <dt className="text-sm text-slate-500">Tanggal Diterima</dt>
              <dd className="mt-0.5 text-base font-semibold text-slate-900">
                {tanggalPanjang(u.createdAt)}
              </dd>
            </div>
          </dl>

          {msg && (
            <p
              className={`mt-4 text-sm font-medium leading-relaxed ${
                msg.includes('Gagal') ? 'text-red-600' : 'text-green-700'
              }`}
            >
              {msg}
            </p>
          )}
        </div>

        {/* Panel tindakan dipisah agar CTA eksplisit dan mudah dipindai */}
        <aside className="w-full rounded-xl bg-slate-50 p-5 lg:w-72 lg:shrink-0">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Tindakan</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                {isPending
                  ? 'Tinjau undangan ini dan pilih respons yang sesuai.'
                  : 'Undangan ini sudah memiliki keputusan akhir.'}
              </p>
            </div>

            {isPending ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                <button
                  onClick={() => handle('diterima')}
                  disabled={responding === u.id}
                  className="btn btn-primary"
                >
                  {responding === u.id ? 'Memproses Penerimaan...' : 'Terima Undangan'}
                </button>
                <button
                  onClick={() => handle('ditolak')}
                  disabled={responding === u.id}
                  className="btn btn-secondary"
                >
                  Tolak Undangan
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <p className="text-sm text-slate-500">Keputusan</p>
                <p className="mt-0.5 text-base font-semibold text-slate-900">
                  {STATUS_LABEL[u.statusUndangan] || u.statusUndangan}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </article>
  )
}

// ── Halaman Utama ─────────────────────────────────────────────────────────────

export default function UndanganPage() {
  const user = useAuthStore((s) => s.user)
  const [undangan, setUndangan] = useState([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(null)

  const fetchUndangan = useCallback(() => {
    setLoading(true)
    proposalDosenApi.getMyInvitations()
      .then(res => setUndangan(res.data.data || []))
      .catch(() => setUndangan([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchUndangan() }, [fetchUndangan])

  const handleRespond = async (id, status, setMsg) => {
    setResponding(id)
    try {
      await proposalDosenApi.respondInvitation(id, status)
      setMsg(status === 'diterima' ? 'Undangan berhasil diterima.' : 'Undangan ditolak.')
      fetchUndangan()
      refreshInvitationBadge() // update badge di sidebar
    } catch (e) {
      setMsg(e.response?.data?.message || 'Gagal merespons undangan.')
    } finally {
      setResponding(null)
    }
  }

  const judul = judulUndangan(getRoleNames(user?.roles)[0])
  const pending = undangan.filter(u => u.statusUndangan === 'pending')
  const riwayat = undangan.filter(u => u.statusUndangan !== 'pending')

  return (
    <div className="page space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="page-title">{judul}</h1>
        <Breadcrumb items={[{ label: judul }]} />
      </header>

      {/* Ringkasan: teks + 3 kotak angka sejajar dalam satu wadah */}
      <section className="card flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-xl text-base leading-relaxed text-slate-600">
          Tinjau, terima, atau tolak undangan sebagai anggota tim proposal secara jelas dan terstruktur.
        </p>
        <dl className="grid shrink-0 grid-cols-3 gap-3 lg:w-[30rem]">
          {[
            { label: 'Total Undangan', value: undangan.length },
            { label: 'Menunggu Respons', value: pending.length },
            { label: 'Riwayat Keputusan', value: riwayat.length },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className="text-xs font-medium text-slate-500 sm:text-sm">{k.label}</dt>
              <dd className="mt-1 font-serif text-2xl font-medium text-navy-950 tabular-nums">{loading ? '—' : k.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {loading ? (
        <section className="card px-6 py-16 text-center">
          <p className="flex items-center justify-center gap-3 text-base text-slate-500">
            <span className="spinner text-navy-600" aria-hidden="true" />
            Memuat data {judul.toLowerCase()}...
          </p>
        </section>
      ) : undangan.length === 0 ? (
        <section className="card">
          <EmptyState judul={judul} />
        </section>
      ) : (
        <div className="space-y-10">
          {pending.length > 0 && (
            <section className="space-y-4">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-navy-950">Undangan Menunggu Respons</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    Bagian ini menampilkan undangan yang masih memerlukan keputusan Anda.
                  </p>
                </div>
                <span className="badge badge-warning self-start sm:self-auto">
                  {pending.length} Undangan Aktif
                </span>
              </header>

              <div className="space-y-4">
                {pending.map(u => (
                  <UndanganCard
                    key={u.id}
                    undangan={u}
                    onRespond={handleRespond}
                    responding={responding}
                  />
                ))}
              </div>
            </section>
          )}

          {riwayat.length > 0 && (
            <section className="space-y-4">
              <header>
                <h2 className="text-xl font-semibold text-navy-950">Riwayat Respons Undangan</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Bagian ini berisi undangan yang sudah diterima atau ditolak sebelumnya.
                </p>
              </header>

              <div className="space-y-4">
                {riwayat.map(u => (
                  <UndanganCard
                    key={u.id}
                    undangan={u}
                    onRespond={handleRespond}
                    responding={responding}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
