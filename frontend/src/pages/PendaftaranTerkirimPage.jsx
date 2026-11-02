import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, Clock, RefreshCw } from 'lucide-react'
import useLenis from '../hooks/useLenis'
import MerekLppm from '../components/MerekLppm'
import { authApi } from '../api/auth'
import { bacaPendaftaran, hapusPendaftaran, rapikanEmail } from '../utils/pendaftaran'
import { pesanDariGalat } from '../utils/pesanGalat'

// ---------------------------------------------------------------------------
// /register/terkirim (tamu): "Pendaftaran sudah terkirim — menunggu persetujuan admin" (W-48).
// Dibuka setelah daftar berhasil (state.baru), saat server menjawab PENDAFTARAN_MENUNGGU
// (state.menunggu), atau saat /register dibuka lagi di peramban yang menyimpan penanda
// (utils/pendaftaran.js; kenyamanan saja). "Daftar dengan data lain" menghapus penanda.
// "Cek status" → POST /auth/register/status (W-48). Email lengkap dari state navigasi (penanda localStorage hanya
// menyimpan email tersamar); dibuka dari penanda → pengguna mengetik emailnya.
// ---------------------------------------------------------------------------

const PERAN = { dosen: 'Dosen', mahasiswa: 'Mahasiswa' }
const STATUS = {
  pending: { badge: 'badge-warning', label: 'Menunggu', ket: 'Pendaftaran masih menunggu persetujuan admin.' },
  approved: { badge: 'badge-success', label: 'Disetujui', ket: 'Akun sudah aktif. Silakan masuk.' },
  rejected: { badge: 'badge-danger', label: 'Ditolak', ket: 'Pendaftaran ditolak. Anda dapat mendaftar ulang dengan identitas yang sama.' },
  tidak_ada: { badge: 'badge-neutral', label: 'Tidak ditemukan', ket: 'Tidak ada pendaftaran dengan email ini.' },
}
const tanggal = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null)

export default function PendaftaranTerkirimPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  useLenis(scrollRef)
  const [data] = useState(() => bacaPendaftaran())
  const menunggu = Boolean(location.state?.menunggu)
  const [email, setEmail] = useState(location.state?.email || '')
  const [cek, setCek] = useState({ memuat: false, status: null, galat: '' })

  const cekStatus = async (e) => {
    e.preventDefault()
    const em = rapikanEmail(email)
    if (!em) return setCek({ memuat: false, status: null, galat: 'Masukkan email yang dipakai mendaftar.' })
    setCek({ memuat: true, status: cek.status, galat: '' })
    try {
      const r = await authApi.registerStatus(em)
      setCek({ memuat: false, status: r.data.data?.status || 'tidak_ada', galat: '' })
    } catch (err) {
      setCek({ memuat: false, status: null, galat: pesanDariGalat(err, 'Status gagal dicek. Coba lagi.') })
    }
  }
  const st = cek.status ? STATUS[cek.status] || STATUS.tidak_ada : STATUS.pending

  if (!data) return <Navigate to="/register" replace />

  return (
    <main ref={scrollRef} data-scroll-container className="fixed inset-0 grid place-items-center overflow-y-auto bg-canvas px-6 py-12">
      <section className="rise w-full max-w-md text-center" aria-labelledby="terkirim-judul">
        <MerekLppm />
        <div className="mx-auto mt-8 grid size-14 place-items-center rounded-full bg-green-50 text-green-700 ring-1 ring-inset ring-green-200">
          {menunggu ? <Clock size={26} strokeWidth={2} aria-hidden="true" /> : <Check size={26} strokeWidth={2.2} aria-hidden="true" />}
        </div>
        <h1 id="terkirim-judul" className="mt-6 font-serif text-3xl font-medium text-navy-950">
          {menunggu ? 'Pendaftaran Sudah Terkirim' : 'Pendaftaran Terkirim'}
        </h1>
        <p className="mt-3 text-base text-slate-600">
          {menunggu
            ? 'Identitas ini sudah pernah didaftarkan dan masih menunggu persetujuan admin. Pendaftaran tidak perlu diulang.'
            : 'Akun Anda sedang menunggu persetujuan admin.'}
        </p>
        <p className="mt-1 text-sm text-slate-500">Anda dapat masuk setelah akun disetujui.</p>

        <dl className="mx-auto mt-6 grid max-w-xs gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-left text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-900">{data.email}</dd>
          </div>
          {data.role ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Mendaftar sebagai</dt>
              <dd className="font-medium text-slate-900">{PERAN[data.role] || data.role}</dd>
            </div>
          ) : null}
          {tanggal(data.createdAt) ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Dikirim</dt>
              <dd className="font-medium text-slate-900">{tanggal(data.createdAt)}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Status</dt>
            <dd className="flex items-center gap-2">
              <span className={`badge ${st.badge}`}>{st.label}</span>
            </dd>
          </div>
        </dl>

        <form onSubmit={cekStatus} className="mx-auto mt-4 max-w-xs space-y-2 text-left" noValidate>
          <label htmlFor="cek-email" className="sr-only">
            Email pendaftaran
          </label>
          <div className="flex gap-2">
            <input id="cek-email" type="email" className="input h-10 min-w-0 flex-1 text-sm" placeholder="Email pendaftaran" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <button type="submit" className="btn btn-secondary h-10 shrink-0 text-sm" disabled={cek.memuat}>
              <RefreshCw size={14} className={cek.memuat ? 'animate-spin' : ''} aria-hidden="true" />
              Cek status
            </button>
          </div>
          <p role="status" className={`text-xs ${cek.galat ? 'text-red-700' : 'text-slate-500'}`}>
            {cek.galat || (cek.status ? st.ket : 'Periksa apakah pendaftaran Anda sudah disetujui admin.')}
          </p>
        </form>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link to="/login" className="btn btn-primary">
            <ChevronLeft size={14} strokeWidth={2.5} aria-hidden="true" />
            Kembali ke Login
          </Link>
          <button
            type="button"
            className="text-sm font-semibold text-navy-700 hover:underline"
            onClick={() => {
              hapusPendaftaran()
              navigate('/register', { replace: true })
            }}
          >
            Daftar dengan data lain
          </button>
        </div>
        <p className="mx-auto mt-6 max-w-sm text-xs leading-relaxed text-slate-400">
          Bila pendaftaran ditolak, Anda dapat mendaftar ulang dengan identitas yang sama.
        </p>
      </section>
    </main>
  )
}
