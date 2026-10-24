import { useState, useEffect } from 'react'
import { usersApi } from '../api/users'
import useAuthStore from '../store/authStore'

const ROLE_LABEL = {
  admin: 'Admin',
  ketua_lppm: 'Ketua PRPM',
  dosen: 'Dosen',
  reviewer: 'Reviewer',
  mahasiswa: 'Mahasiswa',
}

function getRoleNames(roles) {
  if (!roles || roles.length === 0) return []
  if (typeof roles[0] === 'string') return roles
  return roles.map((r) => r.role?.name || r.name || '')
}

export default function ProfilePage() {
  const { user, fetchMe } = useAuthStore()
  const roleNames = getRoleNames(user?.roles)

  // --- Edit Profil form ---
  const [form, setForm] = useState({
    name: '',
    fullName: '',
    noHp: '',
    kontak: '',
    alamat: '',
    institusi: '',
    programStudi: '',
    prodi: '',
    tempatLahir: '',
    tanggalLahir: '',
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'success'|'error', text }

  // --- Ganti Password ---
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  const [activeSection, setActiveSection] = useState('profil') // 'profil' | 'password'

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        fullName: user.fullName || '',
        noHp: user.noHp || '',
        kontak: user.kontak || '',
        alamat: user.alamat || '',
        institusi: user.institusi || '',
        programStudi: user.programStudi || '',
        prodi: user.prodi || '',
        tempatLahir: user.tempatLahir || '',
        tanggalLahir: user.tanggalLahir ? user.tanggalLahir.slice(0, 10) : '',
      })
    }
  }, [user])

  const handleSaveProfil = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const payload = { ...form }
      if (!payload.tanggalLahir) delete payload.tanggalLahir
      await usersApi.updateProfile(payload)
      await fetchMe()
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
      <header>
        <h1 className="page-title">Profil Saya</h1>
        <p className="page-desc">Kelola informasi akun, data diri, dan keamanan Anda.</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Panel ringkasan */}
        <aside>
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
                <span
                  className={`badge ${user.status === 'approved'
                    ? 'badge-success'
                    : 'badge-warning capitalize'
                    }`}
                >
                  {user.status === 'approved' ? 'Aktif' : user.status}
                </span>
              </div>
            </header>

            <div className="hidden border-t border-slate-200 px-6 py-5 lg:block">
              <h3 className="text-sm font-semibold text-navy-950">Ringkasan</h3>
              <dl className="mt-4 space-y-3.5">
                <div>
                  <dt className="text-sm text-slate-500">Nama Panggilan</dt>
                  <dd className="mt-0.5 break-words text-base text-slate-800">{form.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Institusi</dt>
                  <dd className="mt-0.5 break-words text-base text-slate-800">{form.institusi || '—'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Program Studi</dt>
                  <dd className="mt-0.5 break-words text-base text-slate-800">
                    {form.programStudi || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">No. HP</dt>
                  <dd className="mt-0.5 break-words text-base text-slate-800">{form.noHp || '—'}</dd>
                </div>
              </dl>
            </div>
          </section>
        </aside>

        {/* Konten utama */}
        <section className="min-w-0 space-y-6">
          {/* Pengalih bagian */}
          <div role="tablist" aria-label="Pengaturan profil" className="flex gap-7 border-b border-slate-200">
            <button
              role="tab"
              aria-selected={activeSection === 'profil'}
              onClick={() => setActiveSection('profil')}
              className={`-mb-px whitespace-nowrap border-b-2 px-0.5 pb-3 pt-1 text-base font-semibold transition-colors ${activeSection === 'profil'
                ? 'border-navy-800 text-navy-950'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-navy-900'
                }`}
            >
              Edit Profil
            </button>
            <button
              role="tab"
              aria-selected={activeSection === 'password'}
              onClick={() => setActiveSection('password')}
              className={`-mb-px whitespace-nowrap border-b-2 px-0.5 pb-3 pt-1 text-base font-semibold transition-colors ${activeSection === 'password'
                ? 'border-navy-800 text-navy-950'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-navy-900'
                }`}
            >
              Ganti Password
            </button>
          </div>

          {/* Profile form */}
          {activeSection === 'profil' && (
            <section className="card">
              <h2 className="sr-only">Edit Profil</h2>

              <form onSubmit={handleSaveProfil} className="px-6 py-6">
                <div className="space-y-6">
                  {/* Identitas */}
                  <section>
                    <h3 className="text-base font-semibold text-navy-950">Identitas</h3>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="pf-name" className="label">
                          Nama Panggilan
                        </label>
                        <input
                          id="pf-name"
                          className="input"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Nama panggilan"
                        />
                      </div>

                      <div>
                        <label htmlFor="pf-fullName" className="label">
                          Nama Lengkap
                        </label>
                        <input
                          id="pf-fullName"
                          className="input"
                          value={form.fullName}
                          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                          placeholder="Nama lengkap"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label htmlFor="pf-email" className="label">
                          Email
                        </label>
                        <input
                          id="pf-email"
                          className="input"
                          value={user.email}
                          disabled
                        />
                      </div>
                    </div>
                  </section>

                  {/* Kontak */}
                  <section className="border-t border-slate-200 pt-6">
                    <h3 className="text-base font-semibold text-navy-950">Kontak</h3>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="pf-noHp" className="label">
                          No. HP
                        </label>
                        <input
                          id="pf-noHp"
                          className="input"
                          value={form.noHp}
                          onChange={(e) => setForm((f) => ({ ...f, noHp: e.target.value }))}
                          placeholder="08xxxxxxxxxx"
                        />
                      </div>

                      <div>
                        <label htmlFor="pf-kontak" className="label">
                          Kontak
                        </label>
                        <input
                          id="pf-kontak"
                          className="input"
                          value={form.kontak}
                          onChange={(e) => setForm((f) => ({ ...f, kontak: e.target.value }))}
                          placeholder="Kontak alternatif"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label htmlFor="pf-alamat" className="label">
                          Alamat
                        </label>
                        <textarea
                          id="pf-alamat"
                          className="input resize-none"
                          rows={3}
                          value={form.alamat}
                          onChange={(e) => setForm((f) => ({ ...f, alamat: e.target.value }))}
                          placeholder="Alamat lengkap"
                        />
                      </div>
                    </div>
                  </section>

                  {/* Akademik */}
                  <section className="border-t border-slate-200 pt-6">
                    <h3 className="text-base font-semibold text-navy-950">Akademik</h3>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label htmlFor="pf-institusi" className="label">
                          Institusi
                        </label>
                        <input
                          id="pf-institusi"
                          className="input"
                          value={form.institusi}
                          onChange={(e) => setForm((f) => ({ ...f, institusi: e.target.value }))}
                          placeholder="Nama institusi"
                        />
                      </div>

                      <div>
                        <label htmlFor="pf-programStudi" className="label">
                          Program Studi
                        </label>
                        <input
                          id="pf-programStudi"
                          className="input"
                          value={form.programStudi}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, programStudi: e.target.value }))
                          }
                          placeholder="Program studi"
                        />
                      </div>

                      <div>
                        <label htmlFor="pf-prodi" className="label">
                          Prodi
                        </label>
                        <input
                          id="pf-prodi"
                          className="input"
                          value={form.prodi}
                          onChange={(e) => setForm((f) => ({ ...f, prodi: e.target.value }))}
                          placeholder="Kode prodi"
                        />
                      </div>
                    </div>
                  </section>

                  {/* Data pribadi */}
                  <section className="border-t border-slate-200 pt-6">
                    <h3 className="text-base font-semibold text-navy-950">Data Pribadi</h3>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="pf-tempatLahir" className="label">
                          Tempat Lahir
                        </label>
                        <input
                          id="pf-tempatLahir"
                          className="input"
                          value={form.tempatLahir}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, tempatLahir: e.target.value }))
                          }
                          placeholder="Kota lahir"
                        />
                      </div>

                      <div>
                        <label htmlFor="pf-tanggalLahir" className="label">
                          Tanggal Lahir
                        </label>
                        <input
                          id="pf-tanggalLahir"
                          type="date"
                          className="input"
                          value={form.tanggalLahir}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, tanggalLahir: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </section>

                  {msg && (
                    <div
                      role={msg.type === 'success' ? 'status' : 'alert'}
                      className={`rounded-lg border px-4 py-3 text-sm ${msg.type === 'success'
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                    >
                      {msg.text}
                    </div>
                  )}

                  <div className="flex justify-end border-t border-slate-200 pt-6">
                    <button
                      type="submit"
                      disabled={saving}
                      className="btn btn-primary w-full sm:w-auto sm:min-w-40"
                    >
                      {saving ? 'Menyimpan...' : 'Simpan Profil'}
                    </button>
                  </div>
                </div>
              </form>
            </section>
          )}

          {/* Password form */}
          {activeSection === 'password' && (
            <section className="card">
              <h2 className="sr-only">Ganti Password</h2>

              <form onSubmit={handleChangePassword} className="px-6 py-6">
                <div className="space-y-6">
                  <section>
                    <h3 className="text-base font-semibold text-navy-950">Keamanan Akun</h3>

                    <div className="mt-4 grid max-w-lg gap-4">
                      <div>
                        <label htmlFor="pw-lama" className="label">
                          Password Lama
                        </label>
                        <input
                          id="pw-lama"
                          type="password"
                          className="input"
                          value={pwForm.oldPassword}
                          onChange={(e) =>
                            setPwForm((f) => ({ ...f, oldPassword: e.target.value }))
                          }
                          placeholder="Password saat ini"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="pw-baru" className="label">
                          Password Baru
                        </label>
                        <input
                          id="pw-baru"
                          type="password"
                          className="input"
                          value={pwForm.newPassword}
                          onChange={(e) =>
                            setPwForm((f) => ({ ...f, newPassword: e.target.value }))
                          }
                          placeholder="Password baru"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="pw-konfirmasi" className="label">
                          Konfirmasi Password Baru
                        </label>
                        <input
                          id="pw-konfirmasi"
                          type="password"
                          className="input"
                          value={pwForm.confirmPassword}
                          onChange={(e) =>
                            setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))
                          }
                          placeholder="Ulangi password baru"
                          required
                        />
                      </div>
                    </div>
                  </section>

                  {pwMsg && (
                    <div
                      role={pwMsg.type === 'success' ? 'status' : 'alert'}
                      className={`rounded-lg border px-4 py-3 text-sm ${pwMsg.type === 'success'
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                    >
                      {pwMsg.text}
                    </div>
                  )}

                  <div className="flex justify-end border-t border-slate-200 pt-6">
                    <button
                      type="submit"
                      disabled={pwSaving}
                      className="btn btn-primary w-full sm:w-auto sm:min-w-40"
                    >
                      {pwSaving ? 'Menyimpan...' : 'Ubah Password'}
                    </button>
                  </div>
                </div>
              </form>
            </section>
          )}
        </section>
      </div>
    </div>
  )
}
