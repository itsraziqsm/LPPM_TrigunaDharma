import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useLenis from '../hooks/useLenis'
import { ChevronLeft, ChevronRight, CircleAlert, Eye, EyeOff, Copyright } from 'lucide-react'
import LogoLppm from '../components/LogoLppm'
import AuthIntro from '../components/AuthIntro'
import { bacaPendaftaran, rapikanEmail, simpanPendaftaran, validasiDaftar } from '../utils/pendaftaran'

const EyeIcon = ({ open }) => open
  ? (
    <Eye size={16} aria-hidden="true" />
  ) : (
    <EyeOff size={16} aria-hidden="true" />
  )

const Field = ({ label, name, type = 'text', value, onChange, placeholder, required, half, error, hint, inputMode, maxLength, autoComplete }) => (
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
      inputMode={inputMode}
      maxLength={maxLength}
      autoComplete={autoComplete}
      aria-invalid={Boolean(error) || undefined}
    />
    {error ? (
      <span className="mt-1.5 block text-xs text-red-700">{error}</span>
    ) : hint ? (
      <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>
    ) : null}
  </label>
)

// Satu identitas satu pendaftaran (W-48): validasi email/NIDN/NIRM di sini; status pendaftaran
// sebelumnya dari kode galat server → halaman /register/terkirim atau Login.
const LANGKAH = ['Akun', 'Data diri']
const LANGKAH_KOLOM = [['email', 'password'], ['name', 'nidn', 'nim', 'programStudi', 'prodi']]

const PESAN_DUPLIKAT =
  'Email, NIDN, atau NIRM ini sudah terdaftar. Bila pendaftaran Anda masih menunggu persetujuan, tunggu konfirmasi admin; bila sudah disetujui, silakan masuk.'

export default function RegisterPage() {
  const { register, loading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const [role, setRole] = useState('dosen')
  const scrollRef = useRef(null)
  useLenis(scrollRef)
  const [showPwd, setShowPwd] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', nidn: '', nim: '', programStudi: '', prodi: '' })
  const [coba, setCoba] = useState(false) // tampilkan galat per kolom setelah mencoba kirim
  const [galatServer, setGalatServer] = useState({})
  const [duplikat, setDuplikat] = useState(false)
  // Penanda di peramban ini (kenyamanan): pendaftaran sudah pernah terkirim → halaman "sudah terkirim".
  const [sudahTerkirim] = useState(() => Boolean(bacaPendaftaran()))

  const galatKlien = validasiDaftar(role, form)
  const [langkah, setLangkah] = useState(0) // 0 = akun, 1 = data dosen/mahasiswa
  const [arah, setArah] = useState('maju')
  const [cobaLangkah, setCobaLangkah] = useState([false, false])
  const galat = (k) => ((coba || cobaLangkah[LANGKAH_KOLOM[0].includes(k) ? 0 : 1]) ? galatKlien[k] : null) || galatServer[k]
  const lanjut = () => {
    setCobaLangkah((c) => [true, c[1]])
    if (LANGKAH_KOLOM[0].some((k) => galatKlien[k])) return
    setArah('maju')
    setLangkah(1)
  }
  const kembali = () => {
    setArah('mundur')
    setLangkah(0)
  }

  const handleChange = (e) => {
    clearError()
    setDuplikat(false)
    const { name } = e.target
    let { value } = e.target
    // NIDN/NIRM hanya angka (NIRM maks. 10 digit).
    if (name === 'nidn' || name === 'nim') value = value.replace(/\D/g, '').slice(0, name === 'nim' ? 10 : 20)
    setGalatServer((g) => ({ ...g, [name]: undefined }))
    setForm(f => ({ ...f, [name]: value }))
  }
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (langkah === 0) return lanjut()
    setCoba(true)
    if (Object.keys(galatKlien).length) {
      if (LANGKAH_KOLOM[0].some((k) => galatKlien[k])) kembali()
      return
    }
    const email = rapikanEmail(form.email)
    try {
      const payload = role === 'dosen'
        ? { email, name: form.name.trim(), password: form.password, nidn: form.nidn, programStudi: form.programStudi }
        : { email, name: form.name.trim(), password: form.password, nim: form.nim, prodi: form.prodi }
      const res = await register(role, payload)
      simpanPendaftaran({ email, role, createdAt: res?.data?.createdAt })
      navigate('/register/terkirim', { replace: true, state: { baru: true } })
    } catch (err) {
      if (err.code === 'PENDAFTARAN_MENUNGGU') {
        clearError()
        simpanPendaftaran({ email, role, createdAt: err.data?.createdAt })
        navigate('/register/terkirim', { replace: true, state: { menunggu: true } })
      } else if (err.code === 'AKUN_SUDAH_AKTIF') {
        clearError()
        navigate('/login', { replace: true, state: { flash: 'Akun dengan identitas ini sudah aktif. Silakan masuk.', email } })
      } else if (err.status === 422 && err.fieldErrors) {
        setGalatServer(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, [].concat(v).join(' ')])))
        // Galat di email/password → tampilkan langkah 1.
        if (LANGKAH_KOLOM[0].some((k) => err.fieldErrors[k])) kembali()
      } else if (err.status === 409 && !err.code) {
        // Backend lama (sebelum W-48): 409 umum "Resource already exists".
        clearError()
        setDuplikat(true)
      }
    }
  }

  if (sudahTerkirim) return <Navigate to="/register/terkirim" replace />

  return (
    <main ref={scrollRef} data-scroll-container className="fixed inset-0 overflow-y-auto bg-white lg:grid lg:grid-cols-[minmax(24rem,34rem)_minmax(0,1fr)]">
      {/* Intro sekali per sesi: berakhir tepat di header panel kiri / merek ponsel */}
      <AuthIntro />

      {/* Panel kiri: identitas — navy polos, tanpa dekorasi */}
      <aside data-intro="panel" className="hidden bg-rail text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-12" aria-label="Informasi platform">
        <header className="flex items-center gap-3">
          <LogoLppm className="size-11" data-intro="logo" />
          <h1 data-intro="title" className="font-serif text-2xl font-medium tracking-wide text-white">LPPM</h1>
        </header>

        <section className="auth-kiri-masuk" aria-labelledby="register-context-title">
          <h2 id="register-context-title" className="max-w-md font-serif text-[1.9375rem] font-medium leading-[1.25] text-white">
            Bergabung dalam ekosistem riset dan pengabdian yang terstruktur.
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-white/60">
            Pendaftaran dirancang agar dosen dan mahasiswa dapat masuk ke alur kerja akademik secara jelas, rapi, dan mudah dipahami.
          </p>
        </section>

        <footer className="border-t border-white/10 pt-6">
          <p className="flex items-center gap-1.5 text-sm text-white/55">
            <Copyright className="size-4" aria-hidden="true" />
            <span>LPPM DevTeam 2026</span>
          </p>
        </footer>
      </aside>

      {/* Panel kanan: formulir */}
      <section className="flex min-h-full items-start justify-center px-6 py-12 sm:px-10 lg:items-center" aria-labelledby="register-page-title">
        <div className="rise w-full max-w-[26rem]">
          {/* Merek ringkas untuk layar kecil */}
          <div className="mb-10 flex flex-col items-center gap-2 text-center lg:hidden">
            <LogoLppm className="size-10" data-intro="logo" />
            <span data-intro="title" className="font-serif text-2xl font-medium tracking-wide text-navy-950">LPPM</span>
          </div>

          <h2 id="register-page-title" className="font-serif text-[2rem] font-medium leading-tight text-navy-950">Buat Akun Baru</h2>
          <p className="mt-2 text-base leading-relaxed text-slate-500">
            {role === 'dosen'
              ? 'Daftar sebagai dosen untuk mengusulkan dan mengelola kegiatan penelitian dan pengabdian masyarakat.'
              : 'Daftar sebagai mahasiswa untuk ikut serta dalam kegiatan penelitian dan pengabdian masyarakat.'}
          </p>

          {/* Pilihan peran: kotak putih bergeser halus ke tombol aktif (translate, bukan pindah kelas latar). */}
          <div className="relative mt-7 grid grid-cols-2 gap-1 rounded-[10px] bg-slate-100 p-1" role="group" aria-label="Daftar sebagai">
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.375rem)] rounded-lg bg-white shadow-sm ring-1 ring-slate-200 transition-[translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                role === 'mahasiswa' ? 'translate-x-[calc(100%+0.25rem)]' : 'translate-x-0'
              }`}
            />
            {[{ key: 'dosen', label: 'Dosen' }, { key: 'mahasiswa', label: 'Mahasiswa' }].map(t => (
              <button
                key={t.key}
                type="button"
                aria-pressed={role === t.key}
                className={`relative z-10 h-9 rounded-lg text-sm font-semibold transition-colors duration-300 ${role === t.key ? 'text-navy-900' : 'text-slate-500 hover:text-navy-900'}`}
                onClick={() => { setRole(t.key); clearError(); setDuplikat(false); setGalatServer({}) }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error || duplikat ? (
            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700" role="alert" aria-live="polite">
              <CircleAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
              <span>
                {duplikat ? PESAN_DUPLIKAT : error}
                {duplikat ? (
                  <>
                    {' '}
                    <Link to="/login" className="font-semibold underline">
                      Masuk
                    </Link>
                  </>
                ) : null}
              </span>
            </div>
          ) : null}


          <form onSubmit={handleSubmit} className="mt-7 overflow-hidden" noValidate>
            <div key={langkah} className={arah === 'maju' ? 'langkah-maju' : 'langkah-mundur'}>
            {langkah === 0 ? (
            <div className="space-y-4">
              <Field
                label="Email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="nama@email.com"
                required
                error={galat('email')}
                autoComplete="email"
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
                    placeholder="Minimal 8 karakter"
                    autoComplete="new-password"
                    aria-label="Password"
                    aria-invalid={Boolean(galat('password')) || undefined}
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
                {galat('password') ? <span className="mt-1.5 block text-xs text-red-700">{galat('password')}</span> : null}
              </div>
            </div>
            ) : (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-navy-900">{role === 'dosen' ? 'Data Dosen' : 'Data Mahasiswa'}</p>
              <Field
                label="Nama Lengkap"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Nama lengkap Anda"
                required
                error={galat('name')}
                autoComplete="name"
              />

            {role === 'dosen' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="NIDN"
                  name="nidn"
                  value={form.nidn}
                  onChange={handleChange}
                  placeholder="Min. 10 digit"
                  required
                  inputMode="numeric"
                  maxLength={20}
                  error={galat('nidn')}
                  hint="Hanya angka, minimal 10 digit."
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="NIRM"
                  name="nim"
                  value={form.nim}
                  onChange={handleChange}
                  placeholder="10 digit"
                  required
                  inputMode="numeric"
                  maxLength={10}
                  error={galat('nim')}
                  hint="Nomor Induk Registrasi Mahasiswa, 10 digit angka."
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
            </div>
            )}
            </div>

            {/* Bilah progres langkah (1. Akun → 2. Data diri), tepat di atas tombol aksi; bergerak halus saat pindah langkah. */}
            <ol className="mt-8 grid grid-cols-2 gap-3" aria-label="Langkah pendaftaran">
              {LANGKAH.map((l, i) => (
                <li key={l} aria-current={langkah === i ? 'step' : undefined}>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <span
                      className="block h-full rounded-full bg-navy-700 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                      style={{ width: langkah >= i ? '100%' : '0%' }}
                    />
                  </span>
                  <span className={`mt-2 block text-xs font-semibold ${langkah >= i ? 'text-navy-900' : 'text-slate-400'}`}>
                    {i + 1}. {l}
                  </span>
                </li>
              ))}
            </ol>

            {langkah === 0 ? (
              <button type="button" onClick={lanjut} className="btn btn-primary mt-5 h-11 w-full text-[0.9375rem]">
                Lanjut
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                <button type="button" onClick={kembali} className="btn btn-secondary h-11" disabled={loading}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  Kembali
                </button>
                <button type="submit" className="btn btn-primary h-11 text-[0.9375rem]" disabled={loading}>
                  {loading
                    ? (
                      <span className="flex items-center justify-center gap-2.5">
                        <span className="spinner" aria-hidden="true" />
                        Mendaftar...
                      </span>
                    )
                    : 'Daftar Sekarang'}
                </button>
              </div>
            )}
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
