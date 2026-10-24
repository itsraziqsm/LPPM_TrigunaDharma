import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

const EyeIcon = ({ open }) => open
  ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, loading, error, clearError } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)

  const handleChange = (e) => { clearError(); setForm(f => ({ ...f, [e.target.name]: e.target.value })) }
  const handleSubmit = async (e) => {
    e.preventDefault()
    try { await login(form.email, form.password); navigate('/dashboard') } catch { }
  }

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [])

  return (
    <main className="fixed inset-0 overflow-y-auto bg-white lg:grid lg:grid-cols-[minmax(24rem,34rem)_minmax(0,1fr)]">
      {/* Panel kiri: identitas — navy polos, tanpa dekorasi */}
      <aside className="hidden bg-rail text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-12" aria-label="Informasi platform">
        <header className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-[11px] bg-white/[0.07] ring-1 ring-inset ring-white/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brass-400" aria-hidden="true">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <h1 className="font-serif text-2xl font-medium tracking-wide text-white">LPPM</h1>
        </header>

        <section aria-labelledby="platform-title">
          <h2 id="platform-title" className="max-w-md font-serif text-[1.9375rem] font-medium leading-[1.25] text-white">
            Masuk untuk melanjutkan proses penelitian dan pengabdian secara terstruktur.
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-white/60">
            Platform Riset &amp; Pengabdian Masyarakat untuk pengelolaan proposal, evaluasi, monitoring, dan pelaporan.
          </p>
        </section>

        <footer className="border-t border-white/10 pt-6">
          <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-white/55" aria-label="Fitur utama">
            {['Proposal', 'Review', 'Laporan', 'Monitoring'].map(t => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-4 font-serif text-[0.9375rem] italic leading-relaxed text-white/45">
            "Mendukung ekosistem penelitian yang inovatif dan berdampak bagi masyarakat."
          </p>
        </footer>
      </aside>

      {/* Panel kanan: formulir */}
      <section className="flex min-h-full items-center justify-center px-6 py-12 sm:px-10" aria-labelledby="login-page-title">
        <div className="rise w-full max-w-[22.5rem]">
          {/* Merek ringkas untuk layar kecil */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-[11px] bg-rail">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brass-400" aria-hidden="true">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <span className="font-serif text-2xl font-medium tracking-wide text-navy-950">LPPM</span>
          </div>

          <h2 id="login-page-title" className="font-serif text-[2rem] font-medium leading-tight text-navy-950">
            Selamat Datang
          </h2>

          <p className="mt-2 text-base leading-relaxed text-slate-500">
            Masuk ke akun Anda untuk melihat dokumen, meninjau progres, dan melanjutkan pengelolaan kegiatan penelitian maupun pengabdian masyarakat.
          </p>

          {error && (
            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700" role="alert" aria-live="polite">
              <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="label">Alamat Email</label>
              <input
                id="email"
                className="input h-11"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="nama@institusi.ac.id"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>

              <div className="relative">
                <input
                  id="password"
                  className="input h-11 pr-32"
                  type={showPwd ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900"
                  onClick={() => setShowPwd(v => !v)}
                  aria-label={showPwd ? 'Sembunyikan password' : 'Tampilkan password'}
                  aria-pressed={showPwd}
                  aria-controls="password"
                >
                  <EyeIcon open={showPwd} />
                  <span>{showPwd ? 'Sembunyikan' : 'Tampilkan'}</span>
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary h-11 w-full text-[0.9375rem]" disabled={loading}>
              {loading
                ? (
                  <span className="flex items-center justify-center gap-2.5">
                    <span className="spinner" aria-hidden="true" />
                    Memproses...
                  </span>
                )
                : 'Masuk ke Dashboard'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Belum punya akun?{' '}
            <Link to="/register" className="font-semibold text-navy-700 hover:underline">
              Daftar Sekarang
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
