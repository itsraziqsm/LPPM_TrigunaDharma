import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ClipboardList, FileText, Handshake, Mail, Tag, Users } from 'lucide-react'
import { proposalDosenApi } from '../api/Proposaldosen'
import { proposalApi } from '../api/proposal'
import { refreshInvitationBadge } from '../components/Sidebar'
import UserAvatar from '../components/UserAvatar'
import ApiPending from '../components/ApiPending'
import useAuthStore from '../store/authStore'
import { getRoleNames } from '../utils/roles'
import { confirmDialog } from '../utils/dialog'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL, UNDANGAN_COLOR } from './ProposalDosen/constants'
import { Fields, Section } from './KegiatanDetailPage'
import { UNDANGAN_STATUS_COLOR, UNDANGAN_STATUS_LABEL, judulUndangan, tanggalPanjang } from './undanganConst'

// ---------------------------------------------------------------------------
// Detail Undangan (/undangan/:id) — informasi kegiatan terkait undangan.
// Tidak ada endpoint detail undangan: data dicari dari GET /dosen/proposals/invitations.
// Undangan diterima → detail lengkap dari GET /proposals/:id (anggota boleh membaca).
// Undangan menunggu/ditolak → backend menolak GET /proposals/:id (403), jadi hanya
// ringkasan dari daftar undangan; abstrak & tim = ApiPending (W-35).
// Dokumen utama sengaja tidak ditampilkan di halaman ini.
// ---------------------------------------------------------------------------

const rupiah = (v) => (v || v === 0 ? `Rp ${Number(v).toLocaleString('id-ID')}` : '—')
const nama = (u) => u?.fullName || u?.name || '—'

export default function UndanganDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const judulMenu = judulUndangan(getRoleNames(user?.roles)[0])
  const [state, setState] = useState({ status: 'loading', undangan: null, detail: null })
  const [responding, setResponding] = useState(false)
  const [msg, setMsg] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const r = await proposalDosenApi.getMyInvitations()
      const undangan = (r.data.data || []).find((u) => String(u.id) === String(id))
      if (!undangan) return { status: 'notfound', undangan: null, detail: null }
      let detail = null
      if (undangan.statusUndangan === 'diterima') {
        detail = await proposalApi
          .getById(undangan.proposal?.id ?? undangan.proposalId)
          .then((res) => res.data.data)
          .catch(() => null)
      }
      return { status: 'ready', undangan, detail }
    }
    load()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState({ status: 'error', undangan: null, detail: null }))
    return () => {
      alive = false
    }
  }, [id, tick])

  const respond = useCallback(
    async (status) => {
      if (status === 'ditolak') {
        const ok = await confirmDialog({
          title: 'Tolak undangan?',
          message: 'Anda tidak akan menjadi anggota tim kegiatan ini. Keputusan tidak dapat diubah.',
          tone: 'danger',
          confirmText: 'Tolak undangan',
        })
        if (!ok) return
      }
      setResponding(true)
      setMsg(null)
      try {
        await proposalDosenApi.respondInvitation(id, status)
        setMsg({ ok: true, text: status === 'diterima' ? 'Undangan berhasil diterima.' : 'Undangan ditolak.' })
        refreshInvitationBadge()
        setTick((t) => t + 1)
      } catch (e) {
        setMsg({ ok: false, text: e.response?.data?.message || 'Gagal merespons undangan.' })
      } finally {
        setResponding(false)
      }
    },
    [id],
  )

  if (state.status !== 'ready') {
    return (
      <div className="page space-y-6">
        {state.status === 'loading' ? (
          <div className="space-y-4" aria-hidden="true">
            <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200/70" />
            <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : (
          <section className="card px-6 py-12 text-center">
            <h1 className="text-lg font-semibold text-navy-950">
              {state.status === 'notfound' ? 'Undangan tidak ditemukan' : 'Undangan tidak dapat dimuat'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Undangan mungkin sudah dihapus bersama kegiatannya.</p>
            <button type="button" onClick={() => navigate('/undangan')} className="btn btn-secondary btn-sm mt-4">
              Kembali ke {judulMenu}
            </button>
          </section>
        )}
      </div>
    )
  }

  const u = state.undangan
  const p = u.proposal || {}
  const d = state.detail // null bila undangan belum diterima
  const jenis = d?.jenis || p.jenis
  const isPending = u.statusUndangan === 'pending'
  const periode = (d || p).periode
  const pengusul = d?.pengusul || p.pengusul
  const anggota = d?.anggota || []

  return (
    <div className="page rise space-y-6">
      <Link to="/undangan" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {judulMenu}
      </Link>

      {/* Kepala */}
      <header className="card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${UNDANGAN_STATUS_COLOR[u.statusUndangan] || 'badge-neutral'}`}>
            {UNDANGAN_STATUS_LABEL[u.statusUndangan] || u.statusUndangan}
          </span>
          <span className="badge badge-plain">{JENIS_LABEL[jenis] || jenis}</span>
          <span className="badge badge-plain capitalize">Peran Tim: {u.peran}</span>
        </div>
        <h1 className="mt-3 font-serif text-2xl font-medium leading-snug text-navy-950">{d?.judul || p.judul}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <UserAvatar user={pengusul} className="size-7 text-xs" fallbackClassName="bg-navy-50 text-navy-700" />
          Diajukan oleh <span className="font-semibold text-slate-900">{nama(pengusul)}</span>
          {periode ? <span>· periode {periode.nama} {periode.tahun}</span> : null}
        </p>

        <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {isPending
              ? 'Tinjau informasi kegiatan di bawah, lalu terima atau tolak undangan.'
              : `Undangan ${UNDANGAN_STATUS_LABEL[u.statusUndangan]?.toLowerCase()}.`}
          </p>
          {isPending ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => respond('ditolak')} disabled={responding} className="btn btn-secondary">
                Tolak Undangan
              </button>
              <button type="button" onClick={() => respond('diterima')} disabled={responding} className="btn btn-primary">
                {responding ? 'Memproses...' : 'Terima Undangan'}
              </button>
            </div>
          ) : u.statusUndangan === 'diterima' && jenis ? (
            <Link to={`/kegiatan/${jenis}/detail/${p.id}`} className="btn btn-secondary btn-sm">
              Buka halaman kegiatan
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
        {msg ? (
          <p className={`mt-3 text-sm font-medium ${msg.ok ? 'text-green-700' : 'text-red-600'}`} role="status">
            {msg.text}
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section icon={FileText} title="Abstrak" action={d ? null : <ApiPending />}>
            {d ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{d.abstrak || '—'}</p>
            ) : (
              <p className="text-sm text-slate-500">Abstrak tampil setelah undangan diterima.</p>
            )}
          </Section>

          <Section icon={ClipboardList} title="Informasi kegiatan">
            <Fields
              items={[
                { label: 'Status proposal', value: <span className={`badge ${STATUS_COLOR[d?.status || p.status] || 'badge-neutral'}`}>{STATUS_LABEL[d?.status || p.status] || d?.status || p.status || '—'}</span> },
                { label: 'Periode', value: periode ? `${periode.nama}${periode.tahun ? ` (${periode.tahun})` : ''}` : '—' },
                { label: 'Anggaran', value: rupiah(d?.anggaran ?? p.anggaran) },
                { label: 'Skema', value: d?.skema || '—', hidden: !d || jenis === 'pengabdian' },
                { label: 'Rumpun ilmu', value: d?.rumpunIlmu || '—', hidden: !d },
                { label: 'Bidang', value: d?.bidang || '—', hidden: !d },
                { label: 'Ringkasan target luaran', value: d?.luaran || '—', hidden: !d },
                {
                  label: 'Kata kunci',
                  wide: true,
                  hidden: !d,
                  value:
                    (d?.kataKunci || []).length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {d.kataKunci.map((k) => (
                          <span key={k} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            <Tag className="size-3" aria-hidden="true" />
                            {k}
                          </span>
                        ))}
                      </span>
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
          </Section>

          {d && jenis === 'pengabdian' ? (
            <Section icon={Handshake} title="Mitra">
              <Fields
                items={[
                  { label: 'Nama mitra', value: d.mitra || '—' },
                  { label: 'Jenis mitra', value: d.mitraJenis || '—' },
                  { label: 'Kontak', value: d.mitraKontak || '—' },
                  { label: 'Alamat', value: d.mitraAlamat || '—' },
                  { label: 'Pernyataan kebutuhan', value: d.mitraKebutuhan || '—', wide: true },
                ]}
              />
            </Section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-6">
          <Section icon={Mail} title="Undangan">
            <Fields
              items={[
                { label: 'Status', value: UNDANGAN_STATUS_LABEL[u.statusUndangan] || u.statusUndangan },
                { label: 'Peran tim', value: <span className="capitalize">{u.peran || '—'}</span> },
                { label: 'Tanggal diterima', value: tanggalPanjang(u.createdAt), wide: true },
              ]}
            />
          </Section>

          <Section icon={Users} title={d ? `Tim (${anggota.length + 1} orang)` : 'Tim'} action={d ? null : <ApiPending />}>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <UserAvatar user={pengusul} className="size-9 text-sm" fallbackClassName="bg-navy-50 text-navy-700" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{nama(pengusul)}</span>
                  <span className="block truncate text-xs text-slate-500">{pengusul?.email || 'Ketua pengusul'}</span>
                </span>
                <span className="badge badge-info shrink-0">Ketua</span>
              </li>
              {anggota.map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-t border-slate-100 pt-3">
                  <UserAvatar user={a.user || { id: a.userId }} className="size-9 text-sm" fallbackClassName="bg-navy-50 text-navy-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{nama(a.user)}</span>
                    <span className="block truncate text-xs capitalize text-slate-500">{a.peran || 'anggota'}</span>
                  </span>
                  <span className={`badge shrink-0 ${UNDANGAN_COLOR[a.statusUndangan] || 'badge-neutral'}`}>
                    {a.statusUndangan === 'diterima' ? 'Diterima' : a.statusUndangan === 'ditolak' ? 'Ditolak' : 'Menunggu'}
                  </span>
                </li>
              ))}
            </ul>
            {d ? null : <p className="mt-3 text-xs text-slate-500">Anggota tim lain tampil setelah undangan diterima.</p>}
          </Section>
        </aside>
      </div>
    </div>
  )
}
