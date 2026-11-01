import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, CircleAlert, MailCheck } from 'lucide-react'
import useLenis from '../hooks/useLenis'
import MerekLppm from '../components/MerekLppm'
import TombolProses from '../components/TombolProses'
import { authApi } from '../api/auth'
import { pesanDariGalat } from '../utils/pesanGalat'
import { tungguOutro } from '../utils/tungguOutro'
import { rapikanEmail } from '../utils/pendaftaran'

// ---------------------------------------------------------------------------
// /lupa-password (tamu, dari tautan "Lupa password?" di Login): POST /auth/forgot-password { email }.
// Server selalu menjawab sukses (tidak membocorkan apakah email terdaftar) dan mengirim tautan
// FRONTEND_URL/reset-password?token=… (berlaku terbatas) → ResetPasswordPage.
// ---------------------------------------------------------------------------

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LupaPasswordPage() {
  const scrollRef = useRef(null)
  useLenis(scrollRef)
  const [email, setEmail] = useState('')
  const [galat, setGalat] = useState('')
  const [proses, setProses] = useState(false)
  const [berhasil, setBerhasil] = useState(false)
  const [terkirim, setTerkirim] = useState(false)

  const kirim = async (e) => {
    e.preventDefault()
    const em = rapikanEmail(email)
    if (!em) return setGalat('Email wajib diisi.')
    if (!POLA_EMAIL.test(em)) return setGalat('Format email tidak valid (contoh: nama@email.com).')
    setGalat('')
    setProses(true)
    try {
      await authApi.forgotPassword(em)
      setBerhasil(true)
      await tungguOutro()
      setEmail(em)
      setTerkirim(true)
    } catch (err) {
      setGalat(pesanDariGalat(err, 'Permintaan gagal dikirim. Coba lagi.'))
    } finally {
      setProses(false)
      setBerhasil(false)
    }
  }

  return (
    <main ref={scrollRef} data-scroll-container className="fixed inset-0 grid place-items-center overflow-y-auto bg-canvas px-6 py-12">
      <section className="rise w-full max-w-md" aria-labelledby="lupa-judul">
        <MerekLppm />
        {terkirim ? (
          <div className="mt-8 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
              <MailCheck size={26} strokeWidth={2} aria-hidden="true" />
            </div>
            <h1 id="lupa-judul" className="mt-6 font-serif text-3xl font-medium text-navy-950">
              Periksa Email Anda
            </h1>
            <p className="mt-3 text-base text-slate-600">
              Bila <strong className="font-semibold text-slate-900">{email}</strong> terdaftar, tautan untuk mengatur ulang password sudah dikirim.
            </p>
            <p className="mt-1 text-sm text-slate-500">Periksa juga folder spam. Tautan hanya berlaku sementara dan sekali pakai.</p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link to="/login" className="btn btn-primary">
                <ChevronLeft size={14} strokeWidth={2.5} aria-hidden="true" />
                Kembali ke Login
              </Link>
              <button type="button" onClick={() => setTerkirim(false)} className="text-sm font-semibold text-navy-700 hover:underline">
                Kirim ulang / ganti email
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h1 id="lupa-judul" className="font-serif text-2xl font-medium text-navy-950">
              Lupa Password
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Masukkan email akun Anda. Kami akan mengirim tautan untuk membuat password baru.
            </p>
            {galat ? (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700" role="alert">
                <CircleAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                <span>{galat}</span>
              </div>
            ) : null}
            <form onSubmit={kirim} className="mt-5 space-y-5" noValidate>
              <div>
                <label htmlFor="lupa-email" className="label">
                  Alamat Email
                </label>
                <input
                  id="lupa-email"
                  className="input h-11"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setGalat('')
                  }}
                  placeholder="nama@email.com"
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <TombolProses proses={proses} berhasil={berhasil} className="h-11 w-full text-[0.9375rem]" srProses="Mengirim tautan…" srBerhasil="Tautan terkirim">
                Kirim Tautan Reset
              </TombolProses>
            </form>
            <p className="mt-6 text-center text-sm text-slate-500">
              Ingat password?{' '}
              <Link to="/login" className="font-semibold text-navy-700 hover:underline">
                Masuk
              </Link>
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
