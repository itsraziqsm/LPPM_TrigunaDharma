import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Download, KeyRound, TriangleAlert, UserRound } from 'lucide-react'
import { usersApi } from '../api/users'
import useAuthStore from '../store/authStore'
import ApiPending from '../components/ApiPending'

// ---------------------------------------------------------------------------
// Halaman Pengaturan (/profil). Kiri: kartu ringkasan profil yang tetap di
// tempat (sticky) saat sisi kanan digulir. Kanan: Foto Profil, Informasi
// Profil, Ganti Password, dan Zona Berbahaya (gaya GitHub).
// Bagian tanpa endpoint memakai ApiPending — lihat docs/waitingApi-list.md.
// ---------------------------------------------------------------------------

const ROLE_LABEL = {
  admin: 'Admin',
  ketua_lppm: 'Ketua LPPM',
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
]

function getRoleNames(roles) {
  if (!roles || roles.length === 0) return []
  if (typeof roles[0] === 'string') return roles
  return roles.map((r) => r.role?.name || r.name || '')
}

// /auth/me saat ini tidak mengirim field profil (lihat W-08), jadi nilai awal
// bisa kosong. Karena itu yang dikirim saat simpan hanya field yang diubah,
// supaya data di server tidak tertimpa string kosong.
function profileFrom(source) {
  const out = {}
  PROFILE_KEYS.forEach((key) => {
    const value = source?.[key]
    out[key] = key === 'tanggalLahir' ? (value ? String(value).slice(0, 10) : '') : (value ?? '')
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

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const roleNames = getRoleNames(user?.roles)
  const isMahasiswa = roleNames[0] === 'mahasiswa'

  const [saved, setSaved] = useState(() => profileFrom(user))
  const [form, setForm] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  const [photoName, setPhotoName] = useState('')

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

  const initials = (user.name || '?').charAt(0).toUpperCase()

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="page-title">Pengaturan</h1>
          <p className="page-desc">Kelola informasi akun, data diri, dan keamanan Anda.</p>
        </div>
        <nav aria-label="Breadcrumb" className="text-base">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/dashboard" className="font-medium text-navy-600 hover:text-navy-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-slate-400">/</li>
            <li aria-current="page" className="text-slate-500">Pengaturan</li>
          </ol>
        </nav>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Kiri: tetap di tempat (sticky) selama sisi kanan digulir */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="card overflow-hidden">
            <header className="px-6 py-6">
              <div
                className="grid size-14 place-items-center rounded-full bg-navy-800 font-serif text-2xl text-white"
                aria-hidden="true"
              >
                {initials}
              </div>

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
              <div className="relative grid size-24 shrink-0 place-items-center rounded-full bg-navy-100 font-serif text-4xl text-navy-800">
                {initials}
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
                    onChange={(e) => setPhotoName(e.target.files?.[0]?.name || '')}
                  />
                  <span className="max-w-[16rem] truncate text-sm text-slate-500">
                    {photoName || 'Belum ada file dipilih'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <button type="button" className="btn btn-primary btn-sm" disabled>
                    Perbarui Foto
                  </button>
                  <ApiPending />
                </div>
                <p className="text-xs text-slate-500">PNG, JPG, atau WEBP. Sementara foto ditampilkan sebagai inisial nama.</p>
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
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    Email tidak dapat diubah dari halaman ini. Status verifikasi email: <ApiPending />
                  </p>
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
                    <input id="pf-prodi" className="input" value={form.prodi} onChange={set('prodi')} placeholder="Program studi" />
                  </Field>
                ) : (
                  <Field id="pf-programStudi" label="Program Studi" hint={<>Daftar pilihan program studi: <ApiPending /></>}>
                    <input id="pf-programStudi" className="input" value={form.programStudi} onChange={set('programStudi')} placeholder="Program studi" />
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
                    Simpan salinan data dan dokumen Anda sebelum menghapus akun.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ApiPending />
                  <button type="button" className="btn btn-secondary btn-sm" disabled>
                    <Download className="size-4" aria-hidden="true" />
                    Unduh data
                  </button>
                </div>
              </li>
              <li className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900">Hapus akun ini</h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Setelah dihapus, seluruh data dan penyimpanan akun Anda dihapus permanen dan tidak dapat
                    dikembalikan.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ApiPending />
                  <button type="button" className="btn btn-danger btn-sm" disabled>
                    Hapus akun
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
