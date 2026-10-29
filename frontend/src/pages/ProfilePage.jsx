import { useEffect, useState } from 'react'
import Breadcrumb from '../components/Breadcrumb'
import Collapse from '../components/Collapse'
import { useNavigate } from 'react-router-dom'
import { Camera, Download, KeyRound, TriangleAlert, UserRound } from 'lucide-react'
import { usersApi } from '../api/users'
import { authApi } from '../api/auth'
import useAuthStore from '../store/authStore'
import UserAvatar from '../components/UserAvatar'
import { programStudiApi } from '../api/programStudi'
import { confirmDialog } from '../utils/dialog'

// ---------------------------------------------------------------------------
// Halaman Pengaturan (/profil). Kiri: kartu ringkasan profil yang tetap di
// tempat (sticky) saat sisi kanan digulir. Kanan: Foto Profil, Informasi
// Profil, Ganti Password, dan Zona Berbahaya (gaya GitHub).
// Status verifikasi email dari `emailVerifiedAt` (/auth/me); kirim ulang lewat
// POST /auth/verify-email/resend, link email membuka /verify-email.
// ---------------------------------------------------------------------------

const ROLE_LABEL = {
  admin: 'Admin',
  ketua_lppm: 'Ketua LPPM',
  ketua_stmik: 'Ketua STMIK',
  dosen: 'Dosen',
  reviewer: 'Reviewer',
  mahasiswa: 'Mahasiswa',
}

const SECTIONS = [
  { id: 'foto-profil', label: 'Foto Profil' },
  { id: 'informasi-profil', label: 'Informasi Profil' },
  { id: 'ganti-password', label: 'Ganti Password' },
  { id: 'zona-berbahaya', label: 'Zona Berbahaya' },
]

const PROFILE_KEYS = [
  'name',
  'fullName',
  'nidn',
  'nim',
  'noHp',
  'kontak',
  'alamat',
  'institusi',
  'programStudi',
  'prodi',
  'tempatLahir',
  'tanggalLahir',
  'jabatanFungsional',
  'sintaId',
  'sintaScore',
]

function getRoleNames(roles) {
  if (!roles || roles.length === 0) return []
  if (typeof roles[0] === 'string') return roles
  return roles.map((r) => r.role?.name || r.name || '')
}

// Nilai awal dari /auth/me (kini membawa field profil). Saat simpan hanya field
// yang diubah yang dikirim, supaya data di server tidak tertimpa string kosong
// bila suatu field tidak ikut termuat. Semua nilai disimpan sebagai string.
function profileFrom(source) {
  const out = {}
  PROFILE_KEYS.forEach((key) => {
    const value = source?.[key]
    out[key] = key === 'tanggalLahir' ? (value ? String(value).slice(0, 10) : '') : value == null ? '' : String(value)
  })
  return out
}

function Message({ msg }) {
  if (!msg) return null
  return (
    <div
      role={msg.type === 'success' ? 'status' : 'alert'}
      className={`rounded-lg border px-4 py-3 text-sm ${
        msg.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'
      }`}
    >
      {msg.text}
    </div>
  )
}

function SettingsCard({ id, title, desc, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-judul`} className="card scroll-mt-6">
      <header className="border-b border-slate-200 px-6 py-5">
        <h2 id={`${id}-judul`} className="text-lg font-semibold text-navy-950">
          {title}
        </h2>
        {desc ? <p className="mt-0.5 text-sm text-slate-500">{desc}</p> : null}
      </header>
      <div className="px-6 py-6">{children}</div>
    </section>
  )
}

function Field({ id, label, hint, children, wide }) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

function EmailVerification({ verifiedAt }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)

  const resend = async () => {
    setBusy(true)
    setNote(null)
    try {
      const r = await authApi.resendVerification()
      setNote({ ok: true, text: r.data?.message || 'Email verifikasi telah dikirim.' })
    } catch (e) {
      const status = e.response?.status
      setNote({
        ok: false,
        text:
          status === 429
            ? 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.'
            : e.response?.data?.message || 'Gagal mengirim email verifikasi. Coba lagi nanti.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1.5 space-y-1.5 text-xs text-slate-500">
      <p className="flex flex-wrap items-center gap-2">
        Email tidak dapat diubah dari halaman ini.
        {verifiedAt ? (
          <span className="badge badge-success">Terverifikasi</span>
        ) : (
          <>
            <span className="badge badge-warning">Belum diverifikasi</span>
            <button type="button" onClick={resend} disabled={busy} className="font-semibold text-navy-700 hover:text-navy-900 disabled:opacity-60">
              {busy ? 'Mengirim…' : 'Kirim ulang email verifikasi'}
            </button>
          </>
        )}
      </p>
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? 'text-green-700' : 'text-red-700'}>
          {note.text}
        </p>
      ) : null}
    </div>
  )
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const roleNames = getRoleNames(user?.roles)
  const isMahasiswa = roleNames[0] === 'mahasiswa'
  // Ketua LPPM tidak boleh menghapus akunnya sendiri (jabatan struktural).
  const canDeleteAccount = !roleNames.includes('ketua_lppm')

  const [saved, setSaved] = useState(() => profileFrom(user))
  const [form, setForm] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  const [photo, setPhoto] = useState(null) // File terpilih (belum diunggah)
  const [photoPreview, setPhotoPreview] = useState(null)

  // URL pratinjau dibuat sekali per file dan dilepas saat diganti/unmount.
  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null)
      return undefined
    }
    const url = URL.createObjectURL(photo)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoMsg, setPhotoMsg] = useState(null)

  const [prodiOptions, setProdiOptions] = useState(null) // null = gagal/memuat → input teks
  const [exporting, setExporting] = useState(false)
  const [dangerMsg, setDangerMsg] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Master program studi (GET /program-studi, publik).
  useEffect(() => {
    programStudiApi
      .list()
      .then((r) => setProdiOptions((r.data.data || []).map((p) => p.nama)))
      .catch(() => setProdiOptions(null))
  }, [])

  // Perbarui sebagian objek user di store tanpa fetchMe() (fetchMe memicu layar memuat global).
  const patchUser = (patch) => useAuthStore.setState((st) => ({ user: st.user ? { ...st.user, ...patch } : st.user }))

  const handlePhotoUpload = async () => {
    if (!photo) return
    setPhotoMsg(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
      setPhotoMsg({ type: 'error', text: 'Foto harus berformat JPG, PNG, atau WebP.' })
      return
    }
    if (photo.size > 2 * 1024 * 1024) {
      setPhotoMsg({ type: 'error', text: 'Ukuran foto maksimal 2 MB.' })
      return
    }
    setPhotoBusy(true)
    try {
      const { data } = await usersApi.uploadFoto(photo)
      patchUser({ fotoUrl: data?.data?.fotoUrl || null })
      setPhoto(null)
      setPhotoMsg({ type: 'success', text: 'Foto profil diperbarui.' })
    } catch (err) {
      setPhotoMsg({ type: 'error', text: err.response?.data?.message || 'Gagal mengunggah foto.' })
    } finally {
      setPhotoBusy(false)
    }
  }

  const handlePhotoDelete = async () => {
    if (!(await confirmDialog({ tone: 'danger', title: 'Hapus foto profil?', message: 'Foto akan diganti inisial nama Anda.', confirmText: 'Ya, hapus' }))) return
    setPhotoBusy(true)
    setPhotoMsg(null)
    try {
      await usersApi.deleteFoto()
      patchUser({ fotoUrl: null })
      setPhotoMsg({ type: 'success', text: 'Foto profil dihapus.' })
    } catch (err) {
      setPhotoMsg({ type: 'error', text: err.response?.data?.message || 'Gagal menghapus foto.' })
    } finally {
      setPhotoBusy(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setDangerMsg(null)
    try {
      const res = await usersApi.exportAccount()
      const url = URL.createObjectURL(res.data)
      const a = Object.assign(document.createElement('a'), { href: url, download: `data-akun-${user.id}.json` })
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setDangerMsg({ type: 'error', text: 'Gagal mengunduh data akun.' })
    } finally {
      setExporting(false)
    }
  }

  const handleDeleteAccount = async (e) => {
    e.preventDefault()
    if (!canDeleteAccount) return
    setDangerMsg(null)
    setDeleting(true)
    try {
      await usersApi.deleteAccount(deletePassword)
      // Access token masih berlaku sampai kedaluwarsa: wajib keluar sekarang.
      await logout()
      navigate('/login', { replace: true })
    } catch (err) {
      setDangerMsg({ type: 'error', text: err.response?.data?.errors?.password?.[0] || err.response?.data?.message || 'Gagal menghapus akun.' })
      setDeleting(false)
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const changed = PROFILE_KEYS.filter((key) => form[key] !== saved[key])

  const handleSaveProfil = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (changed.length === 0) {
      setMsg({ type: 'success', text: 'Tidak ada perubahan untuk disimpan.' })
      return
    }
    if (changed.includes('name') && !form.name.trim()) {
      setMsg({ type: 'error', text: 'Username wajib diisi.' })
      return
    }
    setSaving(true)
    try {
      const payload = Object.fromEntries(changed.map((key) => [key, form[key]]))
      if (!payload.tanggalLahir) delete payload.tanggalLahir
      const { data } = await usersApi.updateProfile(payload)
      // Respons PATCH berisi profil lengkap: jadikan acuan baru, lalu perbarui
      // nama di store tanpa fetchMe() (fetchMe memicu layar memuat global).
      const next = { ...form, ...profileFrom({ ...form, ...(data?.data || {}) }) }
      setSaved(next)
      setForm(next)
      useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, name: next.name, fullName: next.fullName || null } : s.user }))
      setMsg({ type: 'success', text: 'Profil berhasil disimpan.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Gagal menyimpan profil.' })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwMsg(null)
    if (pwForm.newPassword.length < 8) {
      setPwMsg({ type: 'error', text: 'Password baru minimal 8 karakter.' })
      return
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ type: 'error', text: 'Konfirmasi password tidak cocok.' })
      return
    }
    setPwSaving(true)
    try {
      await usersApi.changePassword(pwForm.oldPassword, pwForm.newPassword)
      setPwMsg({ type: 'success', text: 'Password berhasil diubah.' })
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.message || 'Gagal mengubah password.' })
    } finally {
      setPwSaving(false)
    }
  }

  if (!user) return null


  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="page-title">Pengaturan</h1>
          <p className="page-desc">Kelola informasi akun, data diri, dan keamanan Anda.</p>
        </div>
        <Breadcrumb size="base" items={[{ label: 'Pengaturan' }]} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Kiri: tetap di tempat (sticky) selama sisi kanan digulir */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="card overflow-hidden">
            <header className="px-6 py-6">
              <UserAvatar user={user} className="size-14 text-2xl" fallbackClassName="bg-navy-800 font-serif font-normal text-white" />

              <h2 className="mt-4 break-words font-serif text-xl font-medium leading-snug text-navy-950">
                {user.fullName || user.name || '—'}
              </h2>
              <p className="mt-0.5 break-all text-sm text-slate-500">{user.email}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {roleNames.map((r) => (
                  <span key={r} className="badge badge-tag">
                    {ROLE_LABEL[r] || r}
                  </span>
                ))}
                <span className={`badge ${user.status === 'approved' ? 'badge-success' : 'badge-warning capitalize'}`}>
                  {user.status === 'approved' ? 'Aktif' : user.status}
                </span>
              </div>
            </header>

            <div className="hidden border-t border-slate-200 px-6 py-5 lg:block">
              <h3 className="text-sm font-semibold text-navy-950">Ringkasan</h3>
              <dl className="mt-4 space-y-3.5">
                <div>
                  <dt className="text-sm text-slate-500">Username</dt>
                  <dd className="mt-0.5 break-words text-base text-slate-800">{saved.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Institusi</dt>
                  <dd className="mt-0.5 break-words text-base text-slate-800">{saved.institusi || '—'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Program Studi</dt>
                  <dd className="mt-0.5 break-words text-base text-slate-800">
                    {(isMahasiswa ? saved.prodi : saved.programStudi) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Kontak</dt>
                  <dd className="mt-0.5 break-words text-base text-slate-800">{saved.kontak || saved.noHp || '—'}</dd>
                </div>
              </dl>
            </div>
          </section>

          <nav aria-label="Bagian pengaturan" className="card hidden px-3 py-3 lg:block">
            <ul className="space-y-0.5">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-50 ${
                      s.id === 'zona-berbahaya' ? 'text-red-700' : 'text-slate-600 hover:text-navy-900'
                    }`}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Kanan: semua bagian pengaturan, ikut menggulir */}
        <div className="min-w-0 space-y-6">
          {/* Foto profil */}
          <SettingsCard id="foto-profil" title="Foto Profil" desc="Tambahkan atau perbarui foto profil Anda.">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <div className="relative shrink-0">
                {photoPreview ? (
                  <img src={photoPreview} alt="Pratinjau foto baru" className="size-24 rounded-full object-cover" />
                ) : (
                  <UserAvatar user={user} className="size-24 text-4xl" fallbackClassName="bg-navy-100 font-serif font-normal text-navy-800" alt={`Foto ${user.name}`} />
                )}
                <span className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full bg-white text-navy-700 ring-1 ring-slate-200">
                  <Camera className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <label htmlFor="foto-file" className="btn btn-secondary btn-sm cursor-pointer">
                    Pilih file
                  </label>
                  <input
                    id="foto-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      setPhoto(e.target.files?.[0] || null)
                      setPhotoMsg(null)
                      e.target.value = ''
                    }}
                  />
                  <span className="max-w-[16rem] truncate text-sm text-slate-500">
                    {photo ? photo.name : 'Belum ada file dipilih'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <button type="button" className="btn btn-primary btn-sm" disabled={!photo || photoBusy} onClick={handlePhotoUpload}>
                    {photoBusy && photo ? 'Mengunggah…' : 'Perbarui Foto'}
                  </button>
                  {photo ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhoto(null)} disabled={photoBusy}>
                      Batal
                    </button>
                  ) : user.fotoUrl ? (
                    <button type="button" className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50" onClick={handlePhotoDelete} disabled={photoBusy}>
                      Hapus foto
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">JPG, PNG, atau WebP, maksimal 2 MB.</p>
                <Message msg={photoMsg} />
              </div>
            </div>
          </SettingsCard>

          {/* Informasi profil */}
          <SettingsCard
            id="informasi-profil"
            title="Informasi Profil"
            desc="Perbarui informasi profil akun dan data diri Anda."
          >
            <form onSubmit={handleSaveProfil} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field id="pf-name" label="Username" wide>
                  <input id="pf-name" className="input" value={form.name} onChange={set('name')} placeholder="Nama panggilan" />
                </Field>
                <Field id="pf-fullName" label="Nama Lengkap" hint="Sertakan gelar, mis. Belinda Nasyidah, S.Kom., M.Kom." wide>
                  <input id="pf-fullName" className="input" value={form.fullName} onChange={set('fullName')} placeholder="Nama lengkap dengan gelar" />
                </Field>
                <div className="md:col-span-2">
                  <label htmlFor="pf-email" className="label">
                    Email
                  </label>
                  <input id="pf-email" className="input" value={user.email} disabled />
                  <EmailVerification verifiedAt={user.emailVerifiedAt} />
                </div>

                {isMahasiswa ? (
                  <Field id="pf-nim" label="NIM">
                    <input id="pf-nim" className="input" value={form.nim} onChange={set('nim')} placeholder="Nomor induk mahasiswa" />
                  </Field>
                ) : (
                  <Field id="pf-nidn" label="NIDN / NIDK">
                    <input id="pf-nidn" className="input" value={form.nidn} onChange={set('nidn')} placeholder="Nomor induk dosen" />
                  </Field>
                )}
                {!isMahasiswa ? (
                  <>
                    <Field id="pf-jabatan" label="Jabatan Fungsional">
                      <input id="pf-jabatan" className="input" list="pf-jabatan-list" value={form.jabatanFungsional} onChange={set('jabatanFungsional')} placeholder="mis. Asisten Ahli" />
                      <datalist id="pf-jabatan-list">
                        <option value="Tenaga Pengajar" />
                        <option value="Asisten Ahli" />
                        <option value="Lektor" />
                        <option value="Lektor Kepala" />
                        <option value="Guru Besar" />
                      </datalist>
                    </Field>
                    <Field id="pf-sintaId" label="SINTA ID">
                      <input id="pf-sintaId" className="input" value={form.sintaId} onChange={set('sintaId')} placeholder="ID author SINTA" />
                    </Field>
                    <Field id="pf-sintaScore" label="Skor SINTA" hint="Bilangan bulat 0 atau lebih.">
                      <input id="pf-sintaScore" type="number" min={0} step={1} className="input" value={form.sintaScore} onChange={set('sintaScore')} placeholder="mis. 245" />
                    </Field>
                  </>
                ) : null}
                <Field id="pf-tempatLahir" label="Tempat Lahir">
                  <input id="pf-tempatLahir" className="input" value={form.tempatLahir} onChange={set('tempatLahir')} placeholder="Kota lahir" />
                </Field>
                <Field id="pf-tanggalLahir" label="Tanggal Lahir">
                  <input id="pf-tanggalLahir" type="date" className="input" value={form.tanggalLahir} onChange={set('tanggalLahir')} />
                </Field>
                <Field id="pf-kontak" label="Kontak">
                  <input id="pf-kontak" className="input" value={form.kontak} onChange={set('kontak')} placeholder="08xxxxxxxxxx" />
                </Field>
                <Field id="pf-noHp" label="No. HP">
                  <input id="pf-noHp" className="input" value={form.noHp} onChange={set('noHp')} placeholder="08xxxxxxxxxx" />
                </Field>
                <Field id="pf-institusi" label="Institusi">
                  <input id="pf-institusi" className="input" value={form.institusi} onChange={set('institusi')} placeholder="Nama institusi" />
                </Field>
                {isMahasiswa ? (
                  <Field id="pf-prodi" label="Program Studi">
                    {prodiOptions ? (
                      <select id="pf-prodi" className="input" value={form.prodi} onChange={set('prodi')}>
                        <option value="">-- Pilih program studi --</option>
                        {form.prodi && !prodiOptions.includes(form.prodi) ? <option value={form.prodi}>{form.prodi}</option> : null}
                        {prodiOptions.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input id="pf-prodi" className="input" value={form.prodi} onChange={set('prodi')} placeholder="Program studi" />
                    )}
                  </Field>
                ) : (
                  <Field id="pf-programStudi" label="Program Studi">
                    {prodiOptions ? (
                      <select id="pf-programStudi" className="input" value={form.programStudi} onChange={set('programStudi')}>
                        <option value="">-- Pilih program studi --</option>
                        {form.programStudi && !prodiOptions.includes(form.programStudi) ? (
                          <option value={form.programStudi}>{form.programStudi}</option>
                        ) : null}
                        {prodiOptions.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input id="pf-programStudi" className="input" value={form.programStudi} onChange={set('programStudi')} placeholder="Program studi" />
                    )}
                  </Field>
                )}
                <Field id="pf-alamat" label="Alamat" wide>
                  <textarea id="pf-alamat" className="input resize-none" rows={2} value={form.alamat} onChange={set('alamat')} placeholder="Alamat lengkap" />
                </Field>
              </div>

              <Message msg={msg} />

              <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
                <p className="text-xs text-slate-500">
                  {changed.length > 0 ? `${changed.length} perubahan belum disimpan` : 'Tidak ada perubahan'}
                </p>
                <button type="submit" disabled={saving} className="btn btn-primary sm:min-w-32">
                  <UserRound className="size-4" aria-hidden="true" />
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </SettingsCard>

          {/* Ganti password */}
          <SettingsCard
            id="ganti-password"
            title="Ganti Password"
            desc="Gunakan password yang panjang dan acak agar akun Anda tetap aman."
          >
            <form onSubmit={handleChangePassword} className="space-y-6">
              <div className="grid max-w-lg gap-4">
                <Field id="pw-lama" label="Password Lama">
                  <input
                    id="pw-lama"
                    type="password"
                    autoComplete="current-password"
                    className="input"
                    value={pwForm.oldPassword}
                    onChange={(e) => setPwForm((f) => ({ ...f, oldPassword: e.target.value }))}
                    placeholder="Password saat ini"
                    required
                  />
                </Field>
                <Field id="pw-baru" label="Password Baru" hint="Minimal 8 karakter.">
                  <input
                    id="pw-baru"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                    placeholder="Password baru"
                    required
                  />
                </Field>
                <Field id="pw-konfirmasi" label="Konfirmasi Password Baru">
                  <input
                    id="pw-konfirmasi"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder="Ulangi password baru"
                    required
                  />
                </Field>
              </div>

              <Message msg={pwMsg} />

              <div className="flex justify-end border-t border-slate-200 pt-5">
                <button type="submit" disabled={pwSaving} className="btn btn-primary sm:min-w-32">
                  <KeyRound className="size-4" aria-hidden="true" />
                  {pwSaving ? 'Menyimpan...' : 'Ubah Password'}
                </button>
              </div>
            </form>
          </SettingsCard>

          {/* Zona berbahaya (gaya GitHub) */}
          <section id="zona-berbahaya" aria-labelledby="zona-berbahaya-judul" className="scroll-mt-6">
            <h2 id="zona-berbahaya-judul" className="mb-3 flex items-center gap-2 text-lg font-semibold text-red-700">
              <TriangleAlert className="size-5" aria-hidden="true" />
              Zona Berbahaya
            </h2>
            <ul className="divide-y divide-red-200 overflow-hidden rounded-xl border border-red-300 bg-white">
              <li className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900">Unduh data akun</h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {canDeleteAccount ? 'Simpan salinan data dan dokumen Anda sebelum menghapus akun.' : 'Simpan salinan data dan dokumen akun Anda.'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting}>
                    <Download className="size-4" aria-hidden="true" />
                    {exporting ? 'Menyiapkan…' : 'Unduh data'}
                  </button>
                </div>
              </li>
              {canDeleteAccount ? (
                <>
                  <li className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-900">Hapus akun ini</h3>
                      <p className="mt-0.5 text-sm text-slate-500">
                        Akun dinonaktifkan dan data pribadi dikosongkan; Anda tidak bisa masuk lagi. Proposal, laporan,
                        dan review tetap tersimpan sebagai arsip LPPM atas nama &ldquo;Pengguna Dihapus&rdquo;.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDelete((v) => !v)} aria-expanded={confirmDelete}>
                        Hapus akun
                      </button>
                    </div>
                  </li>
                  <li>
                    <Collapse open={confirmDelete}>
                    <div className="bg-red-50/60 px-6 py-5">
                      <form onSubmit={handleDeleteAccount} className="max-w-md space-y-3">
                        <p className="text-sm font-semibold text-red-800">Tindakan ini tidak dapat dibatalkan.</p>
                        <div>
                          <label htmlFor="hapus-password" className="label">
                            Masukkan password untuk konfirmasi
                          </label>
                          <input
                            id="hapus-password"
                            type="password"
                            autoComplete="current-password"
                            className="input"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            required
                          />
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="btn btn-danger" disabled={deleting || !deletePassword}>
                            {deleting ? 'Menghapus…' : 'Saya mengerti, hapus akun saya'}
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                            Batal
                          </button>
                        </div>
                      </form>
                    </div>
                    </Collapse>
                  </li>
                </>
              ) : (
                <li className="px-6 py-5">
                  <h3 className="text-base font-semibold text-slate-900">Hapus akun ini</h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Akun Ketua LPPM tidak dapat dihapus sendiri. Hubungi Admin bila jabatan berpindah.
                  </p>
                </li>
              )}
              {dangerMsg ? (
                <li className="px-6 py-4">
                  <Message msg={dangerMsg} />
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
