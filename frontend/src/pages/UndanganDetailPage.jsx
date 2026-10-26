import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ClipboardList, Download, FileText, Handshake, Mail, Tag, Target, Users } from 'lucide-react'
import { proposalDosenApi } from '../api/Proposaldosen'
import { LUARAN_JENIS } from '../api/luaran'
import { refreshInvitationBadge } from '../components/Sidebar'
import UserAvatar from '../components/UserAvatar'
import useAuthStore from '../store/authStore'
import { getRoleNames } from '../utils/roles'
import { alertDialog, confirmDialog } from '../utils/dialog'
import api from '../api/axios'
import { simpanBlob } from '../utils/unduhBlob'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL, UNDANGAN_COLOR } from './ProposalDosen/constants'
import { Fields, Section } from './KegiatanDetailPage'
import { UNDANGAN_STATUS_COLOR, UNDANGAN_STATUS_LABEL, judulUndangan, tanggalPanjang } from './undanganConst'

// ---------------------------------------------------------------------------
// Detail Undangan (/undangan/:id) — informasi kegiatan terkait undangan.
// Data: GET /dosen/proposals/invitations/:id (W-35/W-41) → undangan + proposal (abstrak,
// info kegiatan, tim, targetLuaran). `aksesPenuh` false (mahasiswa belum menerima, undangan
// ditolak) → kontak anggota lain tidak dikirim. `aksesPenuh` true (dosen yang diundang, anggota
// yang menerima) → akses baca penuh: unduh file proposal (`dokumenUtama.unduhUrl`, blob) dan
// tautan ke Detail Kegiatan (lampiran, laporan, luaran, review) — W-41, tanpa aksi tulis.
// ---------------------------------------------------------------------------

const rupiah = (v) => (v || v === 0 ? `Rp ${Number(v).toLocaleString('id-ID')}` : '—')
const nama = (u) => u?.fullName || u?.name || '—'

export default function UndanganDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const judulMenu = judulUndangan(getRoleNames(user?.roles)[0])
  const [state, setState] = useState({ status: 'loading', undangan: null })
  const [responding, setResponding] = useState(false)
  const [msg, setMsg] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await proposalDosenApi.getInvitation(id)
        return { status: 'ready', undangan: r.data.data }
      } catch (e) {
        if (e.response?.status === 404) return { status: 'notfound', undangan: null }
        throw e
      }
    }
    load()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState({ status: 'error', undangan: null }))
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
  const d = u.proposal || {}
  const jenis = d.jenis
  const isPending = u.statusUndangan === 'pending'
  const periode = d.periode
  const pengusul = d.pengusul
  const anggota = d.anggota || []
  const targetLuaran = d.targetLuaran || []
  const jenisLuaran = (k) => LUARAN_JENIS[k] || k
  const aksesPenuh = Boolean(u.aksesPenuh) || u.statusUndangan === 'diterima'
  const dok = d.dokumenUtama

  const unduhProposal = async () => {
    try {
      // unduhUrl relatif ke base URL API dan perlu token → lewat axios (blob)
      simpanBlob(await api.get(dok.unduhUrl, { responseType: 'blob' }), dok.nama || 'proposal')
    } catch {
      alertDialog({ title: 'Gagal mengunduh', message: 'File proposal tidak dapat diunduh. Coba lagi.' })
    }
  }

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
        <h1 className="mt-3 font-serif text-2xl font-medium leading-snug text-navy-950">{d.judul}</h1>
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
          ) : null}
        </div>
        {aksesPenuh && jenis ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-4 py-3">
            <p className="mr-auto text-sm text-slate-600">Akses baca penuh: seluruh informasi & dokumen kegiatan (tanpa mengubah).</p>
            {dok?.unduhUrl ? (
              <button type="button" onClick={unduhProposal} className="btn btn-secondary btn-sm">
                <Download className="size-4" aria-hidden="true" />
                Unduh file proposal
              </button>
            ) : null}
            <Link to={`/kegiatan/${jenis}/detail/${d.id}`} className="btn btn-primary btn-sm">
              Lihat seluruh informasi kegiatan
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : null}
        {msg ? (
          <p className={`mt-3 text-sm font-medium ${msg.ok ? 'text-green-700' : 'text-red-600'}`} role="status">
            {msg.text}
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section icon={FileText} title="Abstrak">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{d.abstrak || '—'}</p>
          </Section>

          <Section icon={ClipboardList} title="Informasi kegiatan">
            <Fields
              items={[
                { label: 'Status proposal', value: <span className={`badge ${STATUS_COLOR[d.status] || 'badge-neutral'}`}>{STATUS_LABEL[d.status] || d.status || '—'}</span> },
                { label: 'Periode', value: periode ? `${periode.nama}${periode.tahun ? ` (${periode.tahun})` : ''}` : '—' },
                { label: 'Anggaran', value: rupiah(d.anggaran) },
                { label: 'Skema', value: d.skema || '—', hidden: jenis === 'pengabdian' },
                { label: 'Rumpun ilmu', value: d.rumpunIlmu || '—' },
                { label: 'Bidang', value: d.bidang || '—' },
                { label: 'Ringkasan target luaran', value: d.luaran || '—' },
                {
                  label: 'Kata kunci',
                  wide: true,
                  value:
                    (d.kataKunci || []).length > 0 ? (
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

          {jenis === 'pengabdian' ? (
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

          <Section icon={Target} title="Target luaran">
            {targetLuaran.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada target luaran.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {targetLuaran.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{t.target || '—'}</span>
                      <span className="block text-xs text-slate-500">{jenisLuaran(t.jenis)}</span>
                    </span>
                    {t.targetTanggal ? <span className="text-xs text-slate-500">Target {tanggalPanjang(t.targetTanggal)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
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

          {aksesPenuh ? (
            <Section icon={FileText} title="Dokumen utama">
              {dok ? (
                <div className="space-y-3">
                  <p className="break-words text-sm font-medium text-slate-900">{dok.nama}</p>
                  {dok.ukuran ? <p className="text-xs text-slate-500">{(dok.ukuran / 1024).toFixed(1)} KB</p> : null}
                  <button type="button" onClick={unduhProposal} className="btn btn-secondary btn-sm w-full">
                    <Download className="size-4" aria-hidden="true" />
                    Unduh file proposal
                  </button>
                </div>
              ) : d.dokumenUrl ? (
                <a href={d.dokumenUrl} target="_blank" rel="noreferrer" className="break-all text-sm font-medium text-navy-700 hover:text-navy-900">
                  {d.dokumenUrl}
                </a>
              ) : (
                <p className="text-sm text-slate-500">Pengusul belum mengunggah file proposal.</p>
              )}
            </Section>
          ) : null}

          <Section icon={Users} title={`Tim (${anggota.length + 1} orang)`}>
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
          </Section>
        </aside>
      </div>
    </div>
  )
}
