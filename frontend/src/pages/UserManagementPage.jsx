import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { labelKandidat } from '../utils/kandidatReviewer'
import { usersApi } from '../api/users'
import useAuthStore from '../store/authStore'
import { ClipboardCheck, X } from 'lucide-react'
import { alertDialog, confirmDialog } from '../utils/dialog'
import useLenis from '../hooks/useLenis'
import { KepalaMasuk } from '../components/PeriodeAktif'
import PanelCari, { PilihanFilter } from '../components/PanelCari'
import UserAvatar from '../components/UserAvatar'


// ─── Constants ───────────────────────────────────────────────────────────────

const FILTER_ROLE_OPTIONS = ['dosen', 'reviewer', 'mahasiswa']
const ALL_ROLE_OPTIONS = ['admin', 'ketua_lppm', 'ketua_stmik', 'dosen', 'reviewer', 'mahasiswa']
const STATUS_OPTIONS = ['pending', 'approved', 'rejected']
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }

const ROLE_LABEL = {
  admin: 'Admin', ketua_lppm: 'Ketua LPPM', ketua_stmik: 'Ketua STMIK', dosen: 'Dosen',
  reviewer: 'Reviewer', mahasiswa: 'Mahasiswa',
}
// Status memakai lencana bertitik; peran memakai penanda netral (tanpa titik)
const STATUS_COLOR = {
  approved: 'badge-success capitalize',
  pending: 'badge-warning capitalize',
  rejected: 'badge-danger capitalize',
}
// Keterangan singkat di dialog ubah status (hanya teks bantu tampilan)
const STATUS_HINT = {
  pending: 'Menunggu persetujuan',
  approved: 'Akun disetujui',
  rejected: 'Akun ditolak',
}
const ROLE_COLOR = {
  admin: 'badge-tag',
  ketua_lppm: 'badge-tag',
  ketua_stmik: 'badge-tag',
  dosen: 'badge-tag',
  reviewer: 'badge-tag',
  mahasiswa: 'badge-tag',
}



// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRoleNames(roles) {
  if (!roles || roles.length === 0) return []
  if (typeof roles[0] === 'string') return roles
  return roles.map((r) => r.role?.name || r.name || '')
}

function formatDate(val) {
  if (!val) return null
  return new Date(val).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}


// Determine primary role for display purposes
function getPrimaryRole(roleNames) {
  const order = ['admin', 'ketua_lppm', 'ketua_stmik', 'dosen', 'reviewer', 'mahasiswa']
  for (const r of order) {
    if (roleNames.includes(r)) return r
  }
  return roleNames[0] || 'mahasiswa'
}


// ─── Badge ───────────────────────────────────────────────────────────────────

function Badge({ label, className }) {
  return <span className={`badge ${className}`}>{label}</span>
}


// ─── InfoRow ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value, accent }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <p className="shrink-0 text-sm text-slate-500">{label}</p>
      <p className={`min-w-0 break-words text-right text-base text-slate-900 ${accent ? 'font-mono font-medium tabular-nums' : 'font-medium'}`}>
        {value}
      </p>
    </div>
  )
}

function InfoRowEmpty({ label }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <p className="shrink-0 text-sm text-slate-500">{label}</p>
      <p className="text-base italic text-slate-400">Belum diisi</p>
    </div>
  )
}

function EmptyNote({ children }) {
  return <p className="py-2.5 text-base italic text-slate-400">{children}</p>
}


// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-navy-950">{title}</h3>
      <div className="mt-1 divide-y divide-slate-100">{children}</div>
    </section>
  )
}


// ─── Profile per Role ────────────────────────────────────────────────────────

function ProfileMahasiswa({ user }) {
  return (
    <>
      <Section title="Informasi Akademik">
        {user.nim
          ? <InfoRow label="NIM" value={user.nim} accent />
          : <InfoRowEmpty label="NIM" />}
        <InfoRow label="Program Studi" value={user.prodi || user.programStudi} />
        <InfoRow label="Institusi" value={user.institusi} />
      </Section>

      <Section title="Data Pribadi">
        <InfoRow label="Tempat Lahir" value={user.tempatLahir} />
        <InfoRow label="Tanggal Lahir" value={formatDate(user.tanggalLahir)} />
        {!user.tempatLahir && !user.tanggalLahir && (
          <EmptyNote>Data pribadi belum dilengkapi</EmptyNote>
        )}
      </Section>

      <Section title="Kontak">
        {user.noHp
          ? <InfoRow label="No. HP" value={user.noHp} />
          : <InfoRowEmpty label="No. HP" />}
        <InfoRow label="Alamat" value={user.alamat} />
      </Section>
    </>
  )
}

function ProfileDosen({ user }) {
  return (
    <>
      <Section title="Informasi Akademik">
        {user.nidn
          ? <InfoRow label="NIDN" value={user.nidn} accent />
          : <InfoRowEmpty label="NIDN" />}
        <InfoRow label="Program Studi" value={user.programStudi || user.prodi} />
        <InfoRow label="Institusi" value={user.institusi} />
      </Section>

      <Section title="Data Pribadi">
        <InfoRow label="Nama Lengkap" value={user.fullName} />
        <InfoRow label="Tempat Lahir" value={user.tempatLahir} />
        <InfoRow label="Tanggal Lahir" value={formatDate(user.tanggalLahir)} />
        {!user.fullName && !user.tempatLahir && !user.tanggalLahir && (
          <EmptyNote>Data pribadi belum dilengkapi</EmptyNote>
        )}
      </Section>

      <Section title="Kontak">
        {user.kontak || user.noHp
          ? <InfoRow label="No. HP" value={user.kontak || user.noHp} />
          : <InfoRowEmpty label="No. HP" />}
        <InfoRow label="Alamat" value={user.alamat} />
      </Section>
    </>
  )
}

function ProfileReviewer({ user }) {
  return (
    <>
      <Section title="Informasi Kepakaran">
        {user.nidn
          ? <InfoRow label="NIDN" value={user.nidn} accent />
          : <InfoRowEmpty label="NIDN" />}
        <InfoRow label="Program Studi" value={user.programStudi || user.prodi} />
        <InfoRow label="Institusi" value={user.institusi} />
      </Section>

      <Section title="Data Pribadi">
        <InfoRow label="Nama Lengkap" value={user.fullName} />
        <InfoRow label="Tempat Lahir" value={user.tempatLahir} />
        <InfoRow label="Tanggal Lahir" value={formatDate(user.tanggalLahir)} />
        {!user.fullName && !user.tempatLahir && !user.tanggalLahir && (
          <EmptyNote>Data pribadi belum dilengkapi</EmptyNote>
        )}
      </Section>

      <Section title="Kontak">
        {user.kontak || user.noHp
          ? <InfoRow label="No. HP" value={user.kontak || user.noHp} />
          : <InfoRowEmpty label="No. HP" />}
        <InfoRow label="Alamat" value={user.alamat} />
      </Section>
    </>
  )
}

function ProfileAdmin({ user }) {
  return (
    <Section title="Informasi Akun">
      <p className="py-2.5 text-base leading-relaxed text-slate-600">
        Akun administrator memiliki akses penuh ke seluruh sistem LPPM.
      </p>
      <InfoRow label="Email" value={user.email} />
    </Section>
  )
}

function ProfileKetuaPRPM({ user }) {
  return (
    <Section title="Informasi Jabatan">
      <p className="py-2.5 text-base leading-relaxed text-slate-600">
        Ketua LPPM bertanggung jawab mengelola periode riset dan menyetujui proposal.
      </p>
      <InfoRow label="Email" value={user.email} />
      <InfoRow label="Kontak" value={user.kontak || user.noHp} />
    </Section>
  )
}


function ProfileKetuaStmik({ user }) {
  return (
    <Section title="Informasi Jabatan">
      <p className="py-2.5 text-base leading-relaxed text-slate-600">
        Ketua STMIK memantau seluruh proposal, progres kegiatan, dan anggaran (hanya baca).
      </p>
      <InfoRow label="Email" value={user.email} />
      <InfoRow label="Kontak" value={user.kontak || user.noHp} />
    </Section>
  )
}

// Render the right profile section based on primary role
function RoleProfile({ primaryRole, user }) {
  switch (primaryRole) {
    case 'mahasiswa': return <ProfileMahasiswa user={user} />
    case 'dosen': return <ProfileDosen user={user} />
    case 'reviewer': return <ProfileReviewer user={user} />
    case 'admin': return <ProfileAdmin user={user} />
    case 'ketua_lppm': return <ProfileKetuaPRPM user={user} />
    case 'ketua_stmik': return <ProfileKetuaStmik user={user} />
    default: return <ProfileDosen user={user} />
  }
}


// ─── Modal ───────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div className="overlay">
      <div className="dialog max-w-lg" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-navy-950">{title}</h3>
          <button onClick={onClose} className="icon-btn" aria-label="Tutup" title="Tutup">
            <X className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}


// ─── Akses Penugasan Review (dosen ↔ reviewer) ───────────────────────────────
// Dosen hanya melihat menu "Penugasan Review" bila punya peran `reviewer`
// (utils/roles.js → canReview). Admin & Ketua LPPM: GET/PATCH /users/:id/reviewer
// (status + beri/cabut biasa). Cabut biasa ditolak (409) bila masih ada tugasan
// belum selesai; hanya Ketua yang bisa cabut paksa (POST .../force-revoke) dengan
// mengalihkan setiap tugasan ke reviewer lain (new-api.md bagian 16).
function ReviewerAccess({ user, isKetua, onChanged }) {
  const [status, setStatus] = useState(null)
  const [loadErr, setLoadErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [forceOpen, setForceOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const name = user.fullName || user.name

  useEffect(() => {
    let alive = true
    setLoadErr(null)
    usersApi
      .getReviewerStatus(user.id)
      .then((r) => alive && setStatus(r.data.data))
      .catch((e) => alive && setLoadErr(e.response?.data?.message || 'Status reviewer gagal dimuat.'))
    return () => {
      alive = false
    }
  }, [user.id, tick])

  const aktif = status ? status.isReviewer : getRoleNames(user.roles).includes('reviewer')
  const terbuka = status?.tugasanBelumSelesai || []

  const done = async (text, next) => {
    if (next) setStatus(next)
    setMsg({ ok: true, text })
    setTick((t) => t + 1)
    await onChanged(user.id, next?.roles)
  }

  const beri = async () => {
    const ok = await confirmDialog({
      icon: ClipboardCheck,
      title: 'Jadikan reviewer?',
      message: `${name} akan melihat menu Penugasan Review dan bisa ditugaskan menilai proposal/laporan.`,
      confirmText: 'Ya, jadikan reviewer',
    })
    if (!ok) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await usersApi.setReviewer(user.id, true)
      await done(r.data.message || 'Dosen dijadikan reviewer', r.data.data)
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.message || 'Gagal menjadikan reviewer.' })
    } finally {
      setBusy(false)
    }
  }

  const cabut = async () => {
    // Masih ada tugasan terbuka: Ketua langsung ke cabut paksa, Admin diberi tahu.
    if (terbuka.length > 0) {
      if (isKetua) return setForceOpen(true)
      return alertDialog({
        tone: 'warning',
        title: 'Belum bisa dicabut',
        message: `${name} masih memiliki ${terbuka.length} tugasan review yang belum selesai. Hanya Ketua LPPM yang dapat mencabut paksa dengan mengalihkan tugasan tersebut.`,
      })
    }
    const ok = await confirmDialog({
      tone: 'danger',
      icon: ClipboardCheck,
      title: 'Cabut peran reviewer?',
      message: `${name} tidak lagi melihat menu Penugasan Review dan tidak muncul di daftar reviewer. Review yang sudah final tetap tersimpan.`,
      confirmText: 'Ya, cabut',
    })
    if (!ok) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await usersApi.setReviewer(user.id, false)
      await done(r.data.message || 'Peran reviewer dicabut', r.data.data)
    } catch (e) {
      if (e.response?.status === 409) {
        setTick((t) => t + 1) // muat ulang daftar tugasan terbaru
        if (isKetua) setForceOpen(true)
      }
      setMsg({ ok: false, text: e.response?.data?.message || 'Gagal mencabut peran reviewer.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Penugasan Review">
      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900">Dosen sebagai reviewer</p>
            <p className="text-sm text-slate-500">
              {aktif ? 'Aktif — menu Penugasan Review tampil untuk dosen ini.' : 'Tidak aktif — menu Penugasan Review disembunyikan.'}
            </p>
          </div>
          <span className={`badge ${aktif ? 'badge-success' : 'badge-neutral'}`}>{aktif ? 'Reviewer' : 'Bukan reviewer'}</span>
        </div>

        {status ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">Tugasan belum selesai</dt>
              <dd className={`text-base font-semibold tabular-nums ${terbuka.length ? 'text-amber-700' : 'text-slate-900'}`}>{terbuka.length}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">Review selesai</dt>
              <dd className="text-base font-semibold tabular-nums text-slate-900">{status.jumlahReviewSelesai ?? 0}</dd>
            </div>
          </dl>
        ) : loadErr ? (
          <p className="mt-3 text-sm text-red-700">{loadErr}</p>
        ) : (
          <span className="spinner mt-3 block text-navy-600" aria-hidden="true" />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {aktif ? (
            <button type="button" onClick={cabut} disabled={busy || !status} className="btn btn-secondary btn-sm text-red-700">
              <ClipboardCheck className="size-4" aria-hidden="true" />
              {busy ? 'Menyimpan…' : terbuka.length && isKetua ? 'Cabut paksa & alihkan tugasan' : 'Cabut peran reviewer'}
            </button>
          ) : (
            <button type="button" onClick={beri} disabled={busy || !status} className="btn btn-primary btn-sm">
              <ClipboardCheck className="size-4" aria-hidden="true" />
              {busy ? 'Menyimpan…' : 'Jadikan reviewer'}
            </button>
          )}
        </div>
        {aktif && terbuka.length > 0 && !isKetua ? (
          <p className="mt-2 text-xs text-slate-500">Masih ada tugasan belum selesai; pencabutan paksa hanya oleh Ketua LPPM.</p>
        ) : null}
        {msg ? (
          <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>
            {msg.text}
          </p>
        ) : null}
      </div>

      {forceOpen && status ? (
        <ForceRevokeModal
          user={user}
          tugasan={terbuka}
          onClose={() => setForceOpen(false)}
          onDone={async (next, text) => {
            setForceOpen(false)
            await done(text, next)
          }}
        />
      ) : null}
    </Section>
  )
}

// Cabut paksa (Ketua): pilih reviewer baru untuk setiap tugasan belum selesai.
// Pilihan per tugasan dari GET /users/kandidat-reviewer?itemId=&exclude= (urut beban,
// pengusul item sudah dikeluarkan); nilai awal = rekomendasi backend (disebar merata).
// "Alihkan otomatis" = force-revoke { otomatis: true } tanpa memilih manual (W-32).
function ForceRevokeModal({ user, tugasan, onClose, onDone }) {
  const [kandidat, setKandidat] = useState(null) // { [tugasanId]: [...] }
  const [pilih, setPilih] = useState(() => Object.fromEntries(tugasan.filter((t) => t.rekomendasi?.id).map((t) => [t.id, String(t.rekomendasi.id)])))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all(
      tugasan.map((t) =>
        usersApi
          .getKandidatReviewer({ itemId: t.itemId, exclude: user.id })
          .then((r) => [t.id, (r.data.data || []).filter((k) => !k.sudahDitugaskan && k.id !== t.pengusulId)])
          .catch(() => [t.id, []]),
      ),
    ).then((rows) => alive && setKandidat(Object.fromEntries(rows)))
    return () => {
      alive = false
    }
  }, [tugasan, user.id])

  const lengkap = tugasan.every((t) => pilih[t.id])

  const kirim = async (otomatis) => {
    setBusy(true)
    setErr(null)
    try {
      const pengalihan = tugasan.filter((t) => pilih[t.id]).map((t) => ({ tugasanId: t.id, reviewerBaruId: Number(pilih[t.id]) }))
      const r = await usersApi.forceRevokeReviewer(user.id, otomatis ? [] : pengalihan, otomatis)
      const n = r.data.data?.jumlahDialihkan ?? tugasan.length
      await onDone(r.data.data, `${r.data.message || 'Peran reviewer dicabut paksa'} — ${n} tugasan dialihkan.`)
    } catch (e) {
      setErr(e.response?.data?.message || 'Gagal mencabut paksa.')
      setBusy(false)
    }
  }
  const submit = () => kirim(false)

  return (
    <Modal title="Cabut paksa peran reviewer" onClose={busy ? () => {} : onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {user.fullName || user.name} masih memiliki {tugasan.length} tugasan review yang belum selesai. Alihkan setiap tugasan ke
          reviewer lain; pengalihan dan pencabutan dilakukan sekaligus. Draf review yang belum final akan dihapus.
        </p>
        {err ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}
        <ul className="max-h-80 space-y-3 overflow-y-auto" data-lenis-prevent>
          {tugasan.map((t) => {
            const opsi = kandidat?.[t.id] || []
            return (
              <li key={t.id} className="rounded-lg border border-slate-200 px-3 py-3">
                <p className="text-xs text-slate-500">
                  {t.tipe === 'laporan' ? 'Laporan' : 'Proposal'} · {t.jenis} · status {t.status} · tugasan #{t.id}
                </p>
                <p className="font-semibold text-slate-900">{t.judul}</p>
                <label htmlFor={`fr-${t.id}`} className="sr-only">
                  Reviewer baru untuk tugasan #{t.id}
                </label>
                <select
                  id={`fr-${t.id}`}
                  className="input mt-2"
                  value={pilih[t.id] || ''}
                  disabled={kandidat === null}
                  onChange={(e) => setPilih((p) => ({ ...p, [t.id]: e.target.value }))}
                >
                  <option value="">{kandidat === null ? 'Memuat reviewer…' : '-- Pilih reviewer baru --'}</option>
                  {opsi.map((u) => (
                    <option key={u.id} value={u.id}>
                      {labelKandidat(u)}
                      {t.rekomendasi?.id === u.id ? ' · rekomendasi' : ''}
                    </option>
                  ))}
                </select>
              </li>
            )
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => kirim(true)}
            disabled={busy}
            title="Setiap tugasan dialihkan ke reviewer rekomendasi (beban paling ringan)"
          >
            Alihkan otomatis
          </button>
          <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" onClick={submit} disabled={!lengkap || busy}>
            {busy ? 'Memproses…' : 'Alihkan & cabut reviewer'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function UserDetail({ user, isAdmin, isKetua, onClose, onStatusChange, onRoleChange, onReviewerChanged, onDelete }) {
  const roleNames = getRoleNames(user.roles)
  const primaryRole = getPrimaryRole(roleNames)

  const [statusModal, setStatusModal] = useState(false)
  const [roleModal, setRoleModal] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [newStatus, setNewStatus] = useState(user.status)
  const [newRoles, setNewRoles] = useState(roleNames)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    setNewStatus(user.status)
    setNewRoles(getRoleNames(user.roles))
  }, [user])

  const doSave = async (fn) => {
    setSaving(true); setErr(null)
    try { await fn() }
    catch (e) { setErr(e.response?.data?.message || 'Terjadi kesalahan') }
    finally { setSaving(false) }
  }

  const handleStatusSave = () => doSave(async () => {
    await onStatusChange(user.id, newStatus); setStatusModal(false)
  })

  const handleRoleSave = () => {
    if (!newRoles.length) { setErr('Pilih minimal 1 role'); return }
    doSave(async () => { await onRoleChange(user.id, newRoles); setRoleModal(false) })
  }

  const handleDelete = () => doSave(async () => {
    await onDelete(user.id); setDeleteModal(false); onClose()
  })

  const toggleRole = (r) => setNewRoles((p) => p.includes(r) ? p.filter((x) => x !== r) : [...p, r])

  const displayName = user.fullName && user.fullName !== user.name ? user.fullName : user.name

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-white">
      {/* Header panel */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
        <div>
          <p className="text-sm text-slate-500">Panel Detail</p>
          <h2 className="text-lg font-semibold text-navy-950">Profil Pengguna</h2>
        </div>
        <button onClick={onClose} className="icon-btn" aria-label="Tutup Panel" title="Tutup Panel">
          <X className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Ringkasan utama */}
        <section className="border-b border-slate-200 px-6 py-6">
          <div className="flex items-start gap-4">
            <UserAvatar user={user} className="size-14 text-2xl" fallbackClassName="bg-navy-800 font-serif font-medium text-white" />

            <div className="min-w-0 flex-1">
              <h3 className="break-words text-xl font-semibold leading-tight text-navy-950">{displayName}</h3>
              <p className="mt-1 break-all text-base text-slate-500">{user.email}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge
                  label={user.status}
                  className={STATUS_COLOR[user.status] || 'badge-neutral'}
                />
                {roleNames.map((r) => (
                  <Badge key={r} label={ROLE_LABEL[r] || r} className={ROLE_COLOR[r] || 'badge-tag'} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Isi detail */}
        <div className="space-y-7 px-6 py-6">
          <RoleProfile primaryRole={primaryRole} user={user} />

          <Section title="Informasi Sistem">
            <InfoRow label="ID User" value={`#${user.id}`} accent />
            <InfoRow label="Tanggal Bergabung" value={formatDate(user.createdAt) || '—'} />
          </Section>

          {(isAdmin || isKetua) && roleNames.includes('dosen') && (
            <ReviewerAccess user={user} isKetua={isKetua} onChanged={onReviewerChanged} />
          )}

          {isAdmin && (
            <Section title="Tindakan Admin">
              {/* Tombol aksi dibuat eksplisit dan mudah dipahami */}
              <div className="grid gap-2.5 pt-3">
                <button
                  onClick={() => { setNewStatus(user.status); setErr(null); setStatusModal(true) }}
                  className="group flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <div>
                    <p className="text-base font-semibold text-slate-900">Ubah Status</p>
                    <p className="text-sm text-slate-500">Perbarui status persetujuan akun pengguna.</p>
                  </div>
                  <span className="text-sm font-medium text-navy-700">Pilih</span>
                </button>

                <button
                  onClick={() => { setNewRoles(getRoleNames(user.roles)); setErr(null); setRoleModal(true) }}
                  className="group flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <div>
                    <p className="text-base font-semibold text-slate-900">Ubah Role</p>
                    <p className="text-sm text-slate-500">Atur hak akses dan peran pengguna dalam sistem.</p>
                  </div>
                  <span className="text-sm font-medium text-navy-700">Pilih</span>
                </button>

                <button
                  onClick={() => { setErr(null); setDeleteModal(true) }}
                  className="group flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-white px-4 py-3 text-left transition-colors hover:bg-red-50"
                >
                  <div>
                    <p className="text-base font-semibold text-red-700">Hapus User</p>
                    <p className="text-sm text-red-600/80">Hapus akun pengguna secara permanen dari sistem.</p>
                  </div>
                  <span className="text-sm font-medium text-red-700">Hapus</span>
                </button>
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* Modals */}
      {statusModal && (
        <Modal title="Ubah Status" onClose={() => setStatusModal(false)}>
          <div className="space-y-5">
            {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{err}</div>}

            <fieldset className="space-y-3">
              <legend className="text-base font-semibold text-slate-900">Pilih status akun</legend>
              <div className="space-y-2">
                {STATUS_OPTIONS.map((s) => (
                  <label key={s} className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-colors ${newStatus === s ? 'border-navy-600 bg-navy-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="status"
                        value={s}
                        checked={newStatus === s}
                        onChange={() => setNewStatus(s)}
                        className="accent-navy-800"
                      />
                      <span className="text-base font-medium text-slate-800">{STATUS_HINT[s] || 'Status'}</span>
                    </div>
                    <Badge label={s} className={STATUS_COLOR[s] || 'badge-neutral'} />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                onClick={() => setStatusModal(false)}
                className="btn btn-secondary"
              >
                Batal
              </button>
              <button
                onClick={handleStatusSave}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {roleModal && (
        <Modal title="Ubah Role" onClose={() => setRoleModal(false)}>
          <div className="space-y-5">
            {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{err}</div>}

            <fieldset className="space-y-3">
              <legend className="text-base font-semibold text-slate-900">Pilih role pengguna</legend>
              <div className="space-y-2">
                {ALL_ROLE_OPTIONS.map((r) => (
                  <label key={r} className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-colors ${newRoles.includes(r) ? 'border-navy-600 bg-navy-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={newRoles.includes(r)}
                        onChange={() => toggleRole(r)}
                        className="size-4 rounded accent-navy-800"
                      />
                      <span className="text-base font-medium text-slate-800">{ROLE_LABEL[r] || r}</span>
                    </div>
                    <Badge label={ROLE_LABEL[r] || r} className={ROLE_COLOR[r] || 'badge-tag'} />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                onClick={() => setRoleModal(false)}
                className="btn btn-secondary"
              >
                Batal
              </button>
              <button
                onClick={handleRoleSave}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteModal && (
        <Modal title="Hapus User" onClose={() => setDeleteModal(false)}>
          <div className="space-y-5">
            {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{err}</div>}
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4">
              <p className="text-base leading-relaxed text-red-800">
                Yakin hapus <span className="font-semibold">"{user.name}"</span>? Tindakan ini tidak bisa dibatalkan.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                onClick={() => setDeleteModal(false)}
                className="btn btn-secondary"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="btn btn-destructive"
              >
                {saving ? 'Menghapus...' : 'Hapus User'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </aside>
  )
}


// ─── Main Page ───────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const { user: me } = useAuthStore()
  const myRoles = getRoleNames(me?.roles)
  const isAdmin = myRoles.includes('admin')
  const isKetua = myRoles.includes('ketua_lppm')
  // Smooth scroll di area daftar (halaman ini tidak memakai gulir wadah luar).
  const listScrollRef = useRef(null)
  const listContentRef = useRef(null)
  useLenis(listScrollRef, { contentRef: listContentRef })

  const [users, setUsers] = useState([])
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 15 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState(null)
  const [detailUser, setDetailUser] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const debounceRef = useRef(null)
  const handleSearchInput = (val) => {
    setSearchInput(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(val)
      setPage(1)
    }, 400)
  }

  const fetchUsers = async (opts = {}) => {
    setLoading(true); setError(null)
    try {
      const params = {
        page: opts.page ?? page,
        limit: 15,
        search: opts.search !== undefined ? opts.search : search,
        role: opts.role !== undefined ? opts.role : filterRole,
        status: opts.status !== undefined ? opts.status : filterStatus,
      }
      Object.keys(params).forEach((k) => { if (!params[k] && params[k] !== 0) delete params[k] })
      const res = await usersApi.getAll(params)
      setUsers(res.data.data || [])
      setMeta(res.data.meta || { total: 0, page: 1, limit: 15 })
    } catch {
      setError('Gagal memuat data user')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [page, search, filterRole, filterStatus]) // eslint-disable-line

  const handleFilterRole = (val) => { setFilterRole(val); setPage(1) }
  const handleFilterStatus = (val) => { setFilterStatus(val); setPage(1) }
  const cariSekarang = () => {
    clearTimeout(debounceRef.current)
    setSearch(searchInput.trim())
    setPage(1)
  }

  const openDetail = async (u) => {
    if (selected === u.id) { setSelected(null); setDetailUser(null); return }
    setSelected(u.id); setDetailLoading(true)
    try {
      const res = await usersApi.getById(u.id)
      setDetailUser(res.data.data)
    } catch { setDetailUser(u) }
    finally { setDetailLoading(false) }
  }

  const closeDetail = () => { setSelected(null); setDetailUser(null) }

  // ?id=<userId> (dari pencarian global) langsung membuka detail user.
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedId = Number(searchParams.get('id')) || null
  useEffect(() => {
    if (!linkedId) return
    setSearchParams({}, { replace: true })
    if (selected !== linkedId) openDetail({ id: linkedId })
  }, [linkedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshDetail = async (id) => {
    try { const r = await usersApi.getById(id); setDetailUser(r.data.data) } catch { }
  }

  const handleStatusChange = async (id, status) => {
    await usersApi.updateStatus(id, status)
    await refreshDetail(id)
    fetchUsers()
  }

  const handleRoleChange = async (id, roles) => {
    await usersApi.assignRoles(id, roles)
    await refreshDetail(id)
    fetchUsers()
  }

  // Setelah peran reviewer berubah: segarkan panel & daftar; bila yang diubah
  // akun sendiri, perbarui roles di store agar menu ikut berubah (tanpa fetchMe).
  const handleReviewerChanged = async (id, roles) => {
    if (roles && me?.id === id) useAuthStore.setState((st) => ({ user: st.user ? { ...st.user, roles } : st.user }))
    await refreshDetail(id)
    fetchUsers()
  }

  const handleDelete = async (id) => {
    await usersApi.deleteUser(id)
    fetchUsers()
  }

  const totalPages = Math.ceil((meta.total || 0) / (meta.limit || 15))

  return (
    <div className="flex h-full min-h-0">
      {/* Area utama daftar */}
      <div ref={listScrollRef} data-scroll-container className="@container min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div ref={listContentRef} className="page space-y-6">
          {/* Kepala: judul + breadcrumb, lalu ringkasan (gaya Undangan) */}
          <KepalaMasuk
            judul="Manajemen Pengguna"
            desc="Kelola data pengguna, peran, dan status akun dalam satu tampilan yang rapi dan mudah dipantau."
            crumbs={[{ label: 'Pengguna' }]}
            stats={[
              { label: 'Total Pengguna', value: meta.total },
              { label: 'Halaman Aktif', value: page },
              { label: 'Data per Halaman', value: meta.limit || 15 },
            ]}
          />

          {/* Panel cari standar (components/PanelCari): cari · Filter (peran, status) · Cari */}
          <PanelCari
            id="user"
            value={searchInput}
            onChange={handleSearchInput}
            onSubmit={cariSekarang}
            placeholder="Cari nama atau email"
            aktif={[
              filterRole ? { key: 'peran', label: `Peran: ${ROLE_LABEL[filterRole]}`, onRemove: () => handleFilterRole('') } : null,
              filterStatus ? { key: 'status', label: `Status: ${STATUS_LABEL[filterStatus]}`, onRemove: () => handleFilterStatus('') } : null,
            ].filter(Boolean)}
            onReset={() => {
              setFilterRole('')
              setFilterStatus('')
              setPage(1)
            }}
          >
            <div className="grid gap-4 @2xl:grid-cols-2">
              <PilihanFilter label="Peran" value={filterRole} onChange={handleFilterRole} items={[['', 'Semua peran'], ...FILTER_ROLE_OPTIONS.map((r) => [r, ROLE_LABEL[r]])]} />
              <PilihanFilter label="Status akun" value={filterStatus} onChange={handleFilterStatus} items={[['', 'Semua status'], ...STATUS_OPTIONS.map((st) => [st, STATUS_LABEL[st]])]} />
            </div>
          </PanelCari>

          {/* Tabel user */}
          <section className="card overflow-hidden">
            <header className="border-b border-slate-200 px-6 py-4">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-navy-950">Daftar Pengguna</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Pilih satu baris untuk melihat detail profil di panel kanan.
                  </p>
                </div>
                <div className="text-sm text-slate-500">
                  {meta.total} user terdaftar
                </div>
              </div>
            </header>

            <div className="hidden grid-cols-[minmax(0,1fr)_9rem_6.5rem_9rem] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-3 @4xl:grid">
              <span className="text-xs font-semibold text-slate-500">User</span>
              <span className="text-xs font-semibold text-slate-500">Role</span>
              <span className="text-xs font-semibold text-slate-500">Status</span>
              <span className="text-xs font-semibold text-slate-500">Bergabung</span>
            </div>

            {loading ? (
              <p className="flex items-center justify-center gap-3 px-6 py-14 text-center text-base text-slate-500">
                <span className="spinner text-navy-600" aria-hidden="true" />
                Memuat data pengguna...
              </p>
            ) : error ? (
              <p className="px-6 py-14 text-center text-base text-red-600">{error}</p>
            ) : users.length === 0 ? (
              <p className="px-6 py-14 text-center text-base text-slate-500">Tidak ada user ditemukan</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {users.map((u) => {
                  const uRoles = getRoleNames(u.roles)
                  const isActive = selected === u.id

                  return (
                    <button
                      key={u.id}
                      onClick={() => openDetail(u)}
                      className={`block w-full px-6 py-3.5 text-left transition-colors ${isActive ? 'bg-navy-50' : 'hover:bg-slate-50'}`}
                    >
                      {/* Baris lebar: empat kolom; saat ruang menyempit (panel detail terbuka) jadi dua kolom */}
                      <div className="hidden items-center gap-4 @lg:grid @lg:grid-cols-[minmax(0,1fr)_auto] @4xl:grid-cols-[minmax(0,1fr)_9rem_6.5rem_9rem]">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <UserAvatar user={u} className="size-10 text-sm" fallbackClassName="bg-navy-100 text-navy-800" />
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-slate-900">{u.name}</p>
                            <p className="truncate text-sm text-slate-500">{u.email}</p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 @4xl:contents">
                          <div className="order-2 flex flex-wrap justify-end gap-1.5 @4xl:order-1 @4xl:justify-start">
                            {uRoles.slice(0, 2).map((r) => (
                              <Badge key={r} label={ROLE_LABEL[r] || r} className={ROLE_COLOR[r] || 'badge-tag'} />
                            ))}
                          </div>

                          <div className="order-1 @4xl:order-2">
                            <Badge label={u.status} className={STATUS_COLOR[u.status] || 'badge-neutral'} />
                          </div>

                          <div className="hidden @4xl:order-3 @4xl:block">
                            <span className="whitespace-nowrap text-sm text-slate-600">{formatDate(u.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Baris sempit (ponsel): kartu bertumpuk */}
                      <div className="space-y-3 @lg:hidden">
                        <div className="flex items-start gap-3.5">
                          <UserAvatar user={u} className="size-10 text-sm" fallbackClassName="bg-navy-100 text-navy-800" />
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-semibold text-slate-900">{u.name}</p>
                            <p className="break-all text-sm text-slate-500">{u.email}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="mb-1.5 text-sm text-slate-500">Role</p>
                            <div className="flex flex-wrap gap-1.5">
                              {uRoles.slice(0, 2).map((r) => (
                                <Badge key={r} label={ROLE_LABEL[r] || r} className={ROLE_COLOR[r] || 'badge-tag'} />
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="mb-1.5 text-sm text-slate-500">Status</p>
                            <Badge label={u.status} className={STATUS_COLOR[u.status] || 'badge-neutral'} />
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                          <span className="text-sm text-slate-500">Tanggal Bergabung</span>
                          <span className="text-sm font-medium text-slate-700">{formatDate(u.createdAt)}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Pagination */}
          {totalPages > 1 && (
            <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-base text-slate-500">
                Halaman <span className="font-semibold text-slate-900">{page}</span> dari{' '}
                <span className="font-semibold text-slate-900">{totalPages}</span> · {meta.total} total user
              </p>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn btn-secondary"
                >
                  Halaman Sebelumnya
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn btn-secondary"
                >
                  Halaman Berikutnya
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Latar redup untuk panel yang menimpa layar kecil (menutup panel saat diketuk) */}
      {selected && (
        <div data-scroll-lock-mobile className="fixed inset-0 z-40 bg-navy-950/40 xl:hidden" onClick={closeDetail} aria-hidden="true" />
      )}

      {/* Panel detail: berdampingan di layar lebar, menimpa dari kanan di layar kecil */}
      {selected && (
        detailLoading ? (
          <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md items-center justify-center border-l border-slate-200 bg-white shadow-xl xl:static xl:z-auto xl:w-[420px] xl:max-w-none xl:shrink-0 xl:shadow-none">
            <p className="flex items-center gap-3 text-base text-slate-500">
              <span className="spinner text-navy-600" aria-hidden="true" />
              Memuat detail pengguna...
            </p>
          </aside>
        ) : detailUser ? (
          <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md shadow-xl xl:static xl:z-auto xl:h-full xl:w-[420px] xl:max-w-none xl:shrink-0 xl:shadow-none">
            <UserDetail
              user={detailUser}
              isAdmin={isAdmin}
              isKetua={isKetua}
              onClose={closeDetail}
              onStatusChange={handleStatusChange}
              onRoleChange={handleRoleChange}
              onReviewerChanged={handleReviewerChanged}
              onDelete={handleDelete}
            />
          </div>
        ) : null
      )}
    </div>
  )
}
