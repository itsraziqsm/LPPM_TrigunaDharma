import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useLenis from '../hooks/useLenis'
import { Check, ChevronLeft, CircleAlert, Eye, EyeOff } from 'lucide-react'
import LogoLppm from '../components/LogoLppm'

const EyeIcon = ({ open }) => open
  ? (
    <Eye size={16} aria-hidden="true" />
  ) : (
    <EyeOff size={16} aria-hidden="true" />
  )

const Field = ({ label, name, type = 'text', value, onChange, placeholder, required, half }) => (
  <label className={`block min-w-0 ${half ? 'sm:max-w-xs' : ''}`}>
    <span className="label">
      {label}
      {!required && <span className="ml-1.5 font-normal text-slate-400">(opsional)</span>}
    </span>
    <input
      className="input h-11"
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
    />
  </label>
)

export default function RegisterPage() {
  const { register, loading, error, clearError } = useAuthStore()
  const [role, setRole] = useState('dosen')
  const [success, setSuccess] = useState(false)
  const scrollRef = useRef(null)
  // Dua tampilan (formulir / berhasil) memakai <main> berbeda: pasang ulang Lenis saat berganti.
  useLenis(scrollRef, { resetKey: success })
  const [showPwd, setShowPwd] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', nidn: '', nim: '', programStudi: '', prodi: '' })

  const handleChange = (e) => { clearError(); setForm(f => ({ ...f, [e.target.name]: e.target.value })) }
  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = role === 'dosen'
        ? { email: form.email, name: form.name, password: form.password, nidn: form.nidn, programStudi: form.programStudi }
        : { email: form.email, name: form.name, password: form.password, nim: form.nim, prodi: form.prodi }
      await register(role, payload)
      setSuccess(true)
    } catch { }
  }

  if (success) return (
    <main ref={scrollRef} data-scroll-container className="fixed inset-0 grid place-items-center overflow-y-auto bg-canvas px-6">
      <section className="rise w-full max-w-sm text-center" aria-labelledby="success-title">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
          <Check size={26} strokeWidth={2.2} aria-hidden="true" />
        </div>
        <h2 id="success-title" className="mt-6 font-serif text-3xl font-medium text-navy-950">Pendaftaran Terkirim</h2>
        <p className="mt-3 text-base text-slate-600">
          Akun Anda sedang menunggu persetujuan admin.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Anda akan dapat masuk setelah akun disetujui.
        </p>
        <Link to="/login" className="btn btn-secondary mt-8">
          <ChevronLeft size={14} strokeWidth={2.5} aria-hidden="true" />
          Kembali ke Login
        </Link>
      </section>
    </main>
  )

  return (
    <main ref={scrollRef} data-scroll-container className="fixed inset-0 overflow-y-auto bg-white lg:grid lg:grid-cols-[minmax(24rem,34rem)_minmax(0,1fr)]">
      {/* Panel kiri: identitas — navy polos, tanpa dekorasi */}
      <aside className="hidden bg-rail text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-12" aria-label="Informasi platform">
        <header className="flex items-center gap-3">
          <LogoLppm className="size-11" />
          <h1 className="font-serif text-2xl font-medium tracking-wide text-white">LPPM</h1>
        </header>

        <section aria-labelledby="register-context-title">
          <h2 id="register-context-title" className="max-w-md font-serif text-[1.9375rem] font-medium leading-[1.25] text-white">
            Bergabung dalam ekosistem riset dan pengabdian yang terstruktur.
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-white/60">
            Pendaftaran dirancang agar dosen dan mahasiswa dapat masuk ke alur kerja akademik secara jelas, rapi, dan mudah dipahami.
          </p>
        </section>

        <footer className="border-t border-white/10 pt-6">
          <p className="text-sm text-white/45">Tersedia untuk</p>
          <ul className="mt-3 space-y-3">
            {[
              { label: 'Dosen', desc: 'Buat dan kelola proposal penelitian.' },
              { label: 'Mahasiswa', desc: 'Bergabung sebagai anggota tim kegiatan.' },
            ].map(item => (
              <li key={item.label}>
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="text-sm text-white/55">{item.desc}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 font-serif text-[0.9375rem] italic leading-relaxed text-white/45">
            "Bergabunglah dan jadilah bagian dari komunitas peneliti terbaik."
          </p>
        </footer>
      </aside>

      {/* Panel kanan: formulir */}
      <section className="flex min-h-full items-start justify-center px-6 py-12 sm:px-10 lg:items-center" aria-labelledby="register-page-title">
        <div className="rise w-full max-w-[26rem]">
          {/* Merek ringkas untuk layar kecil */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <LogoLppm className="size-10" />
            <span className="font-serif text-2xl font-medium tracking-wide text-navy-950">LPPM</span>
          </div>

          <h2 id="register-page-title" className="font-serif text-[2rem] font-medium leading-tight text-navy-950">Buat Akun Baru</h2>
          <p className="mt-2 text-base leading-relaxed text-slate-500">
            Daftar sebagai dosen atau mahasiswa untuk mengakses proses penelitian dan pengabdian masyarakat.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-1 rounded-[10px] bg-slate-100 p-1">
            {[{ key: 'dosen', label: 'Dosen' }, { key: 'mahasiswa', label: 'Mahasiswa' }].map(t => (
              <button
                key={t.key}
                type="button"
                className={`h-9 rounded-lg text-sm font-semibold transition-colors ${role === t.key ? 'bg-white text-navy-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-navy-900'}`}
                onClick={() => { setRole(t.key); clearError() }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700" role="alert" aria-live="polite">
              <CircleAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6">
            <p className="text-sm font-semibold text-navy-900">Informasi Akun</p>

            <div className="mt-4 space-y-4">
              <Field
                label="Nama Lengkap"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Nama lengkap Anda"
                required
              />

              <Field
                label="Email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="nama@institusi.ac.id"
                required
              />

              <div>
                <span className="label">Password</span>
                <div className="relative">
                  <input
                    className="input h-11 pr-32"
                    type={showPwd ? 'text' : 'password'}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    required
                    placeholder="Min. 8 karakter"
                    autoComplete="new-password"
                    aria-label="Password"
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900"
                    onClick={() => setShowPwd(v => !v)}
                    aria-label={showPwd ? 'Sembunyikan password' : 'Tampilkan password'}
                    aria-pressed={showPwd}
                  >
                    <EyeIcon open={showPwd} />
                    <span>{showPwd ? 'Sembunyikan' : 'Tampilkan'}</span>
                  </button>
                </div>
              </div>
            </div>

            <hr className="my-6 border-slate-200" />

            <p className="text-sm font-semibold text-navy-900">{role === 'dosen' ? 'Data Dosen' : 'Data Mahasiswa'}</p>

            {role === 'dosen' ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="NIDN"
                  name="nidn"
                  value={form.nidn}
                  onChange={handleChange}
                  placeholder="Opsional"
                />
                <Field
                  label="Program Studi"
                  name="programStudi"
                  value={form.programStudi}
                  onChange={handleChange}
                  placeholder="Opsional"
                />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="NIM"
                  name="nim"
                  value={form.nim}
                  onChange={handleChange}
                  placeholder="Opsional"
                />
                <Field
                  label="Prodi"
                  name="prodi"
                  value={form.prodi}
                  onChange={handleChange}
                  placeholder="Opsional"
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary mt-8 h-11 w-full text-[0.9375rem]" disabled={loading}>
              {loading
                ? (
                  <span className="flex items-center justify-center gap-2.5">
                    <span className="spinner" aria-hidden="true" />
                    Mendaftar...
                  </span>
                )
                : 'Daftar Sekarang'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Sudah punya akun?{' '}
            <Link to="/login" className="font-semibold text-navy-700 hover:underline">Masuk</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
