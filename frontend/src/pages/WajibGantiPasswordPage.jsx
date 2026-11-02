import { useRef, useState } from 'react'
import { CircleAlert, Eye, EyeOff, KeyRound, LogOut } from 'lucide-react'
import useLenis from '../hooks/useLenis'
import MerekLppm from '../components/MerekLppm'
import TombolProses from '../components/TombolProses'
import { usersApi } from '../api/users'
import { pesanDariGalat } from '../utils/pesanGalat'
import { tungguOutro } from '../utils/tungguOutro'
import useAuthStore from '../store/authStore'

// ---------------------------------------------------------------------------
// Wajib ganti password (W-52): Admin mereset password user → `wajibGantiPassword: true` di /auth/me.
// DashboardLayout merender halaman ini (tanpa sidebar) menggantikan semua halaman sampai user mengganti
// password lewat PATCH /users/profile/password { oldPassword: <sementara>, newPassword } (≥ 8, beda dari
// sementara) — server mengosongkan penanda; store diperbarui tanpa fetchMe.
// ---------------------------------------------------------------------------

export default function WajibGantiPasswordPage() {
  const scrollRef = useRef(null)
  useLenis(scrollRef)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [lama, setLama] = useState('')
  const [baru, setBaru] = useState('')
  const [ulang, setUlang] = useState('')
  const [lihat, setLihat] = useState(false)
  const [galat, setGalat] = useState('')
  const [proses, setProses] = useState(false)
  const [berhasil, setBerhasil] = useState(false)

  const simpan = async (e) => {
    e.preventDefault()
    if (!lama) return setGalat('Masukkan password sementara dari Admin.')
    if (baru.length < 8) return setGalat('Password baru minimal 8 karakter.')
    if (baru === lama) return setGalat('Password baru harus berbeda dari password sementara.')
    if (baru !== ulang) return setGalat('Konfirmasi password tidak sama.')
    setGalat('')
    setProses(true)
    try {
      await usersApi.changePassword(lama, baru)
      setBerhasil(true)
      await tungguOutro()
      useAuthStore.setState((st) => ({ user: st.user ? { ...st.user, wajibGantiPassword: false } : st.user }))
    } catch (err) {
      setGalat(pesanDariGalat(err, 'Password gagal diubah. Coba lagi.'))
      setBerhasil(false)
      setProses(false)
    }
  }

  const ubah = (fn) => (e) => {
    fn(e.target.value)
    setGalat('')
  }

  return (
    <main ref={scrollRef} data-scroll-container className="fixed inset-0 grid place-items-center overflow-y-auto bg-canvas px-6 py-12">
      <section className="rise w-full max-w-md" aria-labelledby="wajib-judul">
        <MerekLppm />
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="grid size-12 place-items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
            <KeyRound size={22} aria-hidden="true" />
          </div>
          <h1 id="wajib-judul" className="mt-4 font-serif text-2xl font-medium text-navy-950">
            Ganti Password Sementara
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Halo {user?.fullName || user?.name || 'Pengguna'}, password Anda baru saja direset oleh Admin. Buat password baru sebelum melanjutkan ke dashboard.
          </p>
          {galat ? (
            <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-relaxed text-red-700" role="alert">
              <CircleAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
              <span>{galat}</span>
            </div>
          ) : null}
          <form onSubmit={simpan} className="mt-5 space-y-5" noValidate>
            <div>
              <label htmlFor="wajib-lama" className="label">
                Password Sementara
              </label>
              <input id="wajib-lama" className="input h-11" type={lihat ? 'text' : 'password'} value={lama} onChange={ubah(setLama)} autoComplete="current-password" autoFocus />
            </div>
            <div>
              <label htmlFor="wajib-baru" className="label">
                Password Baru
              </label>
              <div className="relative">
                <input
                  id="wajib-baru"
                  className="input h-11 pr-12"
                  type={lihat ? 'text' : 'password'}
                  value={baru}
                  onChange={ubah(setBaru)}
                  placeholder="Minimal 8 karakter"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setLihat((v) => !v)}
                  aria-label={lihat ? 'Sembunyikan password' : 'Tampilkan password'}
                  aria-pressed={lihat}
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-navy-900"
                >
                  {lihat ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="wajib-ulang" className="label">
                Ulangi Password Baru
              </label>
              <input id="wajib-ulang" className="input h-11" type={lihat ? 'text' : 'password'} value={ulang} onChange={ubah(setUlang)} autoComplete="new-password" />
            </div>
            <TombolProses proses={proses} berhasil={berhasil} className="h-11 w-full text-[0.9375rem]" srProses="Menyimpan password…" srBerhasil="Password tersimpan">
              Simpan & Lanjutkan
            </TombolProses>
          </form>
        </div>
        <button type="button" onClick={() => logout()} className="mx-auto mt-6 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-red-700">
          <LogOut size={16} aria-hidden="true" />
          Keluar
        </button>
      </section>
    </main>
  )
}
