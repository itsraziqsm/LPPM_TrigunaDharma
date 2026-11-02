import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardCheck } from 'lucide-react'
import useAuthStore from '../../store/authStore'
import { KOMPONEN, angkaId, bacaDraf, hitungSkor, labelRekomendasi, rupiahId, tautanForm } from '../../utils/rubrikReview'

// Ringkasan penilaian reviewer di halaman detail proposal/laporan + tautan ke halaman
// Form Penilaian (/penugasan/nilai/:tipe/:id). Skor & dana dari draf lokal (W-54).

export default function KartuPenilaian({ tipe, id, review, terkunci = false }) {
  const userId = useAuthStore((s) => s.user?.id)
  const draf = bacaDraf(userId, tipe, id)
  const h = hitungSkor(draf?.skor)
  const done = review?.isDone === true
  const rekomendasi = review?.rekomendasi || draf?.rekomendasi
  const label = done ? 'Lihat hasil penilaian' : terkunci ? 'Lihat form penilaian' : h.terisi || review ? 'Lanjutkan penilaian' : 'Isi form penilaian'

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5">
        <ClipboardCheck className="size-[18px] text-navy-600" aria-hidden="true" />
        <h2 className="text-base font-semibold text-navy-950">Penilaian Anda</h2>
        <span className={`badge ml-auto ${done ? 'badge-success' : review || h.terisi ? 'badge-warning' : 'badge-neutral'}`}>
          {done ? 'Selesai' : review || h.terisi ? 'Draf' : 'Belum dinilai'}
        </span>
      </header>
      <div className="space-y-4 px-5 py-4">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Rata-rata</dt>
            <dd className="font-serif text-2xl text-navy-950">{angkaId(h.rata)}</dd>
            <dd className="text-xs text-slate-500">
              {h.terisi}/{KOMPONEN.length} komponen
            </dd>
          </div>
          <div className="col-span-2 space-y-1.5">
            <div>
              <dt className="text-xs text-slate-500">Rekomendasi</dt>
              <dd className="font-medium text-navy-900">{rekomendasi ? labelRekomendasi(rekomendasi) : '—'}</dd>
            </div>
            {tipe === 'proposal' ? (
              <div>
                <dt className="text-xs text-slate-500">Dana disetujui</dt>
                <dd className="font-medium text-navy-900">{draf?.danaDisetujui === '' || draf?.danaDisetujui == null ? '—' : rupiahId(rekomendasi === 'ditolak' ? 0 : draf.danaDisetujui)}</dd>
              </div>
            ) : null}
          </div>
        </dl>
        <Link to={tautanForm(tipe, id)} className={`btn w-full ${done || terkunci ? 'btn-secondary' : 'btn-primary'}`}>
          {label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
