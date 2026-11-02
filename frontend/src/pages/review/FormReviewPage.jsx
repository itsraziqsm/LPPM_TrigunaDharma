import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ClipboardCheck, Coins, MessageSquareText, Printer, Save, Send, Sparkles } from 'lucide-react'
import { proposalApi } from '../../api/proposal'
import { reviewerApi } from '../../api/reviewer'
import { laporanApi } from '../../api/laporan'
import useAuthStore from '../../store/authStore'
import Breadcrumb from '../../components/Breadcrumb'
import UserAvatar from '../../components/UserAvatar'
import { confirmDialog } from '../../utils/dialog'
import { batalTab, siapkanTab } from '../../utils/pratinjauPdf'
import { KOMPONEN, REKOMENDASI, SKOR, angkaId, bacaDraf, hapusDraf, hitungSkor, labelRekomendasi, rupiahId } from '../../utils/rubrikReview'
import { JENIS_LABEL } from '../ProposalDosen/constants'
import { danaFinal } from '../../utils/danaKegiatan'
import { cariTugasan } from './cariTugasan'
import { segarkanTugasanReview } from '../../utils/tugasanReview'

// ---------------------------------------------------------------------------
// Form Penilaian Reviewer — halaman sendiri (/penugasan/nilai/proposal|laporan/:id), mengikuti
// formulir kertas LPPM: kepala (judul, pengusul, bidang ilmu) → A. Penilaian substansi (7 komponen,
// skor 1–5 + catatan singkat) → total, rata-rata & kelayakan otomatis → B. Catatan reviewer →
// C. Rekomendasi (+ dana disetujui: proposal = ditentukan reviewer, ≤ dana diusulkan, final setelah
// review selesai; laporan = dana disetujui proposal asal + realisasi, baca saja).
// Server (W-54, new-api.md bagian 30.2): POST /proposals|laporan/:id/reviews {catatan, rekomendasi, skor[{kode,skor,catatan}],
// danaDisetujui (proposal)} lalu /finalize (server menolak bila skor < 7, rekomendasi kosong, atau dana proposal kosong;
// ditolak → dana 0). Nilai awal dari `myReview` tugasan; draf lokal lama (sebelum W-54) hanya dipakai sekali bila server
// belum punya skor, lalu dihapus setelah tersimpan.
// ---------------------------------------------------------------------------

const SUMBER = {
  proposal: {
    ambil: (id) => proposalApi.getById(id).then((r) => r.data.data),
    tugasan: (id) => cariTugasan(reviewerApi.getMyTugasan, (t) => String(t.proposalId ?? t.proposal?.id) === String(id)),
    simpan: (id, p) => reviewerApi.submitReview(id, p),
    final: (id) => reviewerApi.finalizeReview(id),
    daftar: '/penugasan',
    detail: (id) => `/proposals/detail/${id}`,
    nama: 'Proposal',
  },
  laporan: {
    ambil: (id) => laporanApi.getById(id).then((r) => r.data.data),
    tugasan: (id) => cariTugasan(laporanApi.getTugasan, (t) => String(t.laporanId ?? t.laporan?.id) === String(id)),
    simpan: (id, p) => laporanApi.submitReview(id, p),
    final: (id) => laporanApi.finalizeReview(id),
    daftar: '/penugasan?tab=laporan',
    detail: (id) => `/laporan-masuk/detail/${id}`,
    nama: 'Laporan',
  },
}

const TONE = {
  success: { badge: 'badge-success', pilih: 'border-green-600 bg-green-50 ring-green-600/20', titik: 'border-green-600 bg-green-600' },
  warning: { badge: 'badge-warning', pilih: 'border-amber-500 bg-amber-50 ring-amber-500/20', titik: 'border-amber-500 bg-amber-500' },
  danger: { badge: 'badge-danger', pilih: 'border-red-600 bg-red-50 ring-red-600/20', titik: 'border-red-600 bg-red-600' },
}

const nama = (u) => u?.fullName || u?.name || '—'
const hanyaAngka = (s) => String(s ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '')
const formEl = (msg) => (e) => (e.response?.data?.errors ? Object.values(e.response.data.errors).flat().join(' ') : e.response?.data?.message || msg)

function formAwal(review, drafLama) {
  const dariServer = Array.isArray(review?.skor) && review.skor.length > 0
  const skor = {}
  const catatanSkor = {}
  for (const x of review?.skor || []) {
    skor[x.kode] = Number(x.skor)
    if (x.catatan) catatanSkor[x.kode] = x.catatan
  }
  const d = dariServer ? null : drafLama
  const dana = review?.danaDisetujui ?? d?.danaDisetujui
  return {
    skor: d?.skor || skor,
    catatanSkor: d?.catatanSkor || catatanSkor,
    catatan: review?.catatan ?? d?.catatan ?? '',
    rekomendasi: review?.rekomendasi ?? d?.rekomendasi ?? '',
    danaDisetujui: dana == null || dana === '' ? '' : String(Math.round(Number(dana))),
  }
}

export default function FormReviewPage({ tipe = 'proposal' }) {
  const { id } = useParams()
  const src = SUMBER[tipe]
  const user = useAuthStore((s) => s.user)
  const [state, setState] = useState({ status: 'loading', item: null, review: null })
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [cobaFinal, setCobaFinal] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([src.ambil(id), src.tugasan(id)])
      .then(([item, tugasan]) => {
        if (!alive) return
        const review = tugasan?.myReview || null
        setState({ status: tugasan ? 'ready' : 'bukan-tugasan', item, review })
        setForm(formAwal(review, bacaDraf(user?.id, tipe, id)))
      })
      .catch((e) => alive && setState({ status: e.response?.status === 403 ? 'forbidden' : 'error', item: null, review: null }))
    return () => {
      alive = false
    }
  }, [id, tipe, src, user?.id])

  const hasil = useMemo(() => hitungSkor(form?.skor), [form?.skor])

  const kembali = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to={src.detail(id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Kembali ke {src.nama.toLowerCase()}
      </Link>
      <Breadcrumb items={[{ label: 'Penugasan Review', to: src.daftar }, { label: `Review ${src.nama}`, to: src.detail(id) }, { label: 'Form Penilaian' }]} />
    </div>
  )

  if (state.status === 'loading') {
    return (
      <div className="page space-y-4" aria-hidden="true">
        <div className="h-8 w-1/2 animate-pulse rounded bg-slate-200/70" />
        <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
      </div>
    )
  }
  if (state.status !== 'ready') {
    return (
      <div className="page space-y-6">
        {kembali}
        <section className="card px-6 py-12 text-center">
          <h1 className="text-lg font-semibold text-navy-950">
            {state.status === 'bukan-tugasan'
              ? `${src.nama} ini tidak ditugaskan kepada Anda`
              : state.status === 'forbidden'
                ? `Anda tidak memiliki akses ke ${src.nama.toLowerCase()} ini`
                : 'Form penilaian tidak dapat dimuat'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Buka dari daftar Penugasan Review.</p>
        </section>
      </div>
    )
  }

  const item = state.item
  const done = state.review?.isDone === true
  const terkunci = tipe === 'laporan' && item.status !== 'review'
  const baca = done || terkunci
  const pakaiDana = tipe === 'proposal'
  const diusulkan = Number(item.anggaran) || 0
  const ditolak = form.rekomendasi === 'ditolak'
  const dana = ditolak ? 0 : form.danaDisetujui === '' ? null : Number(form.danaDisetujui)
  const danaLebih = pakaiDana && dana != null && diusulkan > 0 && dana > diusulkan
  const persenDana = pakaiDana && dana != null && diusulkan > 0 ? Math.round((dana / diusulkan) * 100) : null
  // Laporan: dana = dana disetujui proposal asal (field `danaDisetujui` laporan, baca saja).
  const danaLaporan = tipe === 'laporan' ? danaFinal(item) : null
  // Proposal yang sudah diputuskan: dana final, server menolak perubahan.
  const danaTerkunci = pakaiDana && (item.status === 'disetujui' || item.status === 'ditolak')
  const saran = hasil.kelayakan?.saran

  const ubah = (patch) => {
    setMsg(null)
    setForm((f) => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) }))
  }
  const setSkor = (kode, n) => ubah((f) => ({ skor: { ...f.skor, [kode]: n } }))
  const setCatSkor = (kode, v) => ubah((f) => ({ catatanSkor: { ...f.catatanSkor, [kode]: v } }))

  const kurang = [
    !hasil.lengkap && `skor ${KOMPONEN.length - hasil.terisi} komponen`,
    !form.rekomendasi && 'rekomendasi',
    pakaiDana && !ditolak && dana == null && 'dana disetujui',
    danaLebih && 'dana disetujui melebihi dana diusulkan',
  ].filter(Boolean)

  const payload = () => {
    const p = {
      skor: KOMPONEN.filter((k) => Number(form.skor[k.kode]) >= 1).map((k) => ({
        kode: k.kode,
        skor: Number(form.skor[k.kode]),
        ...(form.catatanSkor[k.kode]?.trim() ? { catatan: form.catatanSkor[k.kode].trim().slice(0, 200) } : {}),
      })),
    }
    if (form.catatan.trim()) p.catatan = form.catatan.trim()
    if (form.rekomendasi) p.rekomendasi = form.rekomendasi
    if (pakaiDana && !danaTerkunci) p.danaDisetujui = dana
    return p
  }

  // Simpan ke server; respons = review terbaru (skor, totalSkor, rataSkor, danaDisetujui).
  const kirim = async () => {
    const r = await src.simpan(id, payload())
    hapusDraf(user?.id, tipe, id)
    return r.data?.data || null
  }

  const simpan = async () => {
    if (danaLebih) return setMsg({ ok: false, text: 'Dana disetujui tidak boleh melebihi dana diusulkan.' })
    setBusy('save')
    setMsg(null)
    try {
      const rv = await kirim()
      setState((s) => ({ ...s, review: { ...(s.review || {}), ...(rv || payload()), isDone: false } }))
      setMsg({ ok: true, text: 'Draf penilaian disimpan.' })
    } catch (e) {
      setMsg({ ok: false, text: formEl('Gagal menyimpan penilaian.')(e) })
    } finally {
      setBusy('')
    }
  }

  const selesaikan = async () => {
    setCobaFinal(true)
    if (kurang.length) {
      setMsg({ ok: false, text: `Lengkapi dulu: ${kurang.join(', ')}.` })
      return
    }
    const ok = await confirmDialog({
      title: `Selesaikan review ${src.nama.toLowerCase()}?`,
      message: `Rata-rata ${angkaId(hasil.rata)} (${hasil.kelayakan?.label}), rekomendasi ${labelRekomendasi(form.rekomendasi)}${pakaiDana ? `, dana disetujui ${rupiahId(dana)}` : ''}. Penilaian tidak dapat diubah lagi.`,
      confirmText: 'Ya, selesaikan',
    })
    if (!ok) return
    setBusy('final')
    setMsg(null)
    try {
      if (ditolak && pakaiDana) ubah({ danaDisetujui: '0' })
      await kirim()
      const r = await src.final(id)
      setState((s) => ({ ...s, review: { ...(s.review || {}), ...payload(), ...(r.data?.data || {}), isDone: true } }))
      setMsg({ ok: true, text: 'Review telah diselesaikan.' })
      segarkanTugasanReview()
    } catch (e) {
      setMsg({ ok: false, text: formEl('Gagal menyelesaikan review.')(e) })
    } finally {
      setBusy('')
    }
  }

  const cetak = async () => {
    siapkanTab()
    try {
      const { cetakFormReview } = await import('./formReviewPDF')
      cetakFormReview({ tipe, item, form: { ...form, danaDisetujui: pakaiDana ? (ditolak ? 0 : form.danaDisetujui) : danaLaporan }, reviewer: nama(user) })
    } catch {
      batalTab()
      setMsg({ ok: false, text: 'PDF gagal dibuat.' })
    }
  }

  const status = done ? ['badge-success', 'Review selesai'] : state.review ? ['badge-warning', 'Draf penilaian'] : ['badge-neutral', 'Belum dinilai']

  return (
    <div className="page rise space-y-6">
      {kembali}

      <header className="card overflow-hidden">
        <div className="space-y-3 border-b border-slate-200 bg-navy-950 px-6 py-5 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium text-white/85">
              {src.nama} {JENIS_LABEL[item.jenis] || item.jenis}
            </span>
            <span className={`badge ${status[0]}`}>{status[1]}</span>
          </div>
          <h1 className="font-serif text-2xl font-medium text-white sm:text-3xl">Form Penilaian Reviewer</h1>
        </div>
        <dl className="grid gap-x-8 gap-y-3 px-6 py-5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-slate-500">Judul</dt>
          <dd className="font-serif text-lg leading-snug text-navy-950">{item.judul}</dd>
          <dt className="text-slate-500">Nama pengusul</dt>
          <dd className="flex items-center gap-2 font-medium text-navy-900">
            <UserAvatar user={item.pengusul} className="size-6 text-[10px]" fallbackClassName="bg-navy-50 text-navy-700" />
            {nama(item.pengusul)}
          </dd>
          <dt className="text-slate-500">Bidang ilmu</dt>
          <dd className="font-medium text-navy-900">{[item.rumpunIlmu, item.bidang].filter(Boolean).join(' / ') || '—'}</dd>
          <dt className="text-slate-500">Reviewer</dt>
          <dd className="font-medium text-navy-900">{nama(user)}</dd>
        </dl>
      </header>

      {terkunci && !done ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Laporan tidak sedang dalam tahap review, penilaian tidak dapat diubah.
        </p>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {/* A. Penilaian substansi */}
          <section className="card overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-navy-950">
                <ClipboardCheck className="size-[18px] text-navy-600" aria-hidden="true" />
                A. Penilaian substansi
              </h2>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                Skor 1 (sangat kurang) – 5 (sangat baik)
              </span>
            </header>
            <div className="hidden grid-cols-[2rem_minmax(0,1fr)_14.5rem] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs font-semibold text-slate-500 lg:grid">
              <span>No</span>
              <span>Komponen penilaian · catatan singkat</span>
              <span className="text-center">Skor (1–5)</span>
            </div>
            <ol className="divide-y divide-slate-100">
              {KOMPONEN.map((k, i) => {
                const nilai = form.skor[k.kode]
                const kosong = cobaFinal && !nilai
                return (
                  <li key={k.kode} className={`grid gap-x-4 gap-y-2.5 px-5 py-4 lg:grid-cols-[2rem_minmax(0,1fr)_14.5rem] ${kosong ? 'bg-red-50/60' : ''}`}>
                    <span className="hidden pt-0.5 text-sm font-semibold text-slate-400 lg:block">{i + 1}</span>
                    <div className="min-w-0 space-y-2">
                      <p id={`kmp-${k.kode}`} className="text-sm font-semibold text-navy-950">
                        <span className="mr-1.5 text-slate-400 lg:hidden">{i + 1}.</span>
                        {k.label}
                      </p>
                      {baca ? (
                        form.catatanSkor[k.kode] ? <p className="text-sm text-slate-600">{form.catatanSkor[k.kode]}</p> : null
                      ) : (
                        <input
                          type="text"
                          className="input h-9 text-sm"
                          maxLength={200}
                          placeholder="Catatan singkat (opsional)"
                          aria-label={`Catatan singkat ${k.label}`}
                          value={form.catatanSkor[k.kode] || ''}
                          onChange={(e) => setCatSkor(k.kode, e.target.value)}
                        />
                      )}
                    </div>
                    <div role="radiogroup" aria-labelledby={`kmp-${k.kode}`} className="flex gap-1.5 lg:justify-center lg:self-start">
                      {SKOR.map((n) => {
                        const aktif = Number(nilai) === n
                        return (
                          <label
                            key={n}
                            className={`grid size-10 place-items-center rounded-lg border text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-500 ${
                              aktif ? 'border-navy-900 bg-navy-900 text-white' : baca ? 'border-slate-200 text-slate-300' : 'cursor-pointer border-slate-300 bg-white text-slate-700 hover:border-navy-400 hover:bg-navy-50'
                            }`}
                          >
                            <input
                              type="radio"
                              className="sr-only"
                              name={`skor-${k.kode}`}
                              value={n}
                              checked={aktif}
                              disabled={baca}
                              onChange={() => setSkor(k.kode, n)}
                            />
                            {n}
                          </label>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
            </ol>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5 text-sm">
              <span>
                Total skor <strong className="ml-1 text-navy-950">{hasil.terisi ? hasil.total : '—'}</strong>
              </span>
              <span>
                Rata-rata <strong className="ml-1 text-navy-950">{angkaId(hasil.rata)}</strong>
              </span>
              {hasil.kelayakan ? <span className={`badge ${TONE[hasil.kelayakan.tone].badge}`}>{hasil.kelayakan.label}</span> : null}
              <span className="text-xs text-slate-500 sm:ml-auto">≥ 4,0 layak lanjut · 3,0–3,9 layak dengan revisi · &lt; 3,0 tidak layak</span>
            </div>
          </section>

          {/* B. Catatan reviewer */}
          <section className="card overflow-hidden">
            <header className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-navy-950">
                <MessageSquareText className="size-[18px] text-navy-600" aria-hidden="true" />
                B. Catatan reviewer
              </h2>
            </header>
            <div className="px-5 py-4">
              {baca ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{form.catatan || '—'}</p>
              ) : (
                <textarea
                  rows={4}
                  className="input resize-y leading-relaxed"
                  aria-label="Catatan reviewer"
                  placeholder="Catatan untuk pengusul, mis. referensi minimal terbitan 5 tahun terakhir."
                  value={form.catatan}
                  onChange={(e) => ubah({ catatan: e.target.value })}
                />
              )}
            </div>
          </section>

          {/* C. Rekomendasi + dana */}
          <section className="card overflow-hidden">
            <header className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-navy-950">
                <Coins className="size-[18px] text-navy-600" aria-hidden="true" />
                C. Rekomendasi & pendanaan
              </h2>
            </header>
            <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <fieldset className="space-y-2.5">
                <legend className="mb-2.5 text-sm font-semibold text-slate-700">Rekomendasi</legend>
                {REKOMENDASI.map((r) => {
                  const aktif = form.rekomendasi === r.value
                  const t = TONE[r.tone]
                  return (
                    <label
                      key={r.value}
                      className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy-500 ${
                        aktif ? `${t.pilih} ring-4` : cobaFinal && !form.rekomendasi ? 'border-red-300 bg-white' : 'border-slate-200 bg-white'
                      } ${baca ? '' : 'cursor-pointer hover:border-navy-300'}`}
                    >
                      <input type="radio" className="sr-only" name="rekomendasi" value={r.value} checked={aktif} disabled={baca} onChange={() => ubah({ rekomendasi: r.value })} />
                      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 ${aktif ? t.titik : 'border-slate-300'}`}>
                        {aktif ? <Check className="size-3.5 text-white" strokeWidth={3} aria-hidden="true" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-950">
                          {r.label}
                          {saran === r.value && !baca ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-navy-50 px-1.5 py-0.5 text-[11px] font-medium text-navy-700">
                              <Sparkles className="size-3" aria-hidden="true" />
                              Sesuai skor
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">{r.desc}</span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>

              {pakaiDana ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    Pendanaan
                  </p>
                  <div className="overflow-hidden rounded-xl border border-slate-300">
                    <div className="grid grid-cols-2 border-b border-slate-300 bg-slate-50 text-center text-xs font-semibold text-slate-600">
                      <span className="border-r border-slate-300 px-3 py-2">Dana diusulkan</span>
                      <span className="px-3 py-2">Dana disetujui</span>
                    </div>
                    <div className="grid grid-cols-2 text-center">
                      <span className="grid place-items-center border-r border-slate-300 px-3 py-3 text-sm text-slate-700">{rupiahId(item.anggaran)}</span>
                      <span className="px-2 py-2">
                        {baca || ditolak || danaTerkunci ? (
                          <span className="grid h-full place-items-center text-sm font-bold italic text-navy-950">{dana == null ? '—' : rupiahId(dana)}</span>
                        ) : (
                          <label className={`flex h-10 items-center gap-1 rounded-lg border px-2.5 focus-within:border-navy-500 focus-within:ring-2 focus-within:ring-navy-500/20 ${danaLebih || (cobaFinal && dana == null) ? 'border-red-400' : 'border-slate-300'}`}>
                            <span className="text-sm text-slate-500">Rp</span>
                            <input
                              inputMode="numeric"
                              aria-label="Dana disetujui"
                              className="w-full min-w-0 bg-transparent text-right text-sm font-bold text-navy-950 outline-none"
                              placeholder="0"
                              value={form.danaDisetujui === '' ? '' : Number(form.danaDisetujui).toLocaleString('id-ID')}
                              onChange={(e) => ubah({ danaDisetujui: hanyaAngka(e.target.value) })}
                            />
                          </label>
                        )}
                      </span>
                    </div>
                  </div>
                  {!baca && !ditolak && !danaTerkunci && diusulkan > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-slate-500">Isi cepat</span>
                      {[100, 75, 50, 30].map((p) => (
                        <button key={p} type="button" className="btn btn-ghost btn-sm h-7 border border-slate-200 px-2 text-xs" onClick={() => ubah({ danaDisetujui: String(Math.round((diusulkan * p) / 100)) })}>
                          {p}%
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <p className={`text-xs ${danaLebih ? 'text-red-700' : 'text-slate-500'}`}>
                    {ditolak
                      ? 'Rekomendasi ditolak: dana disetujui otomatis Rp 0.'
                      : danaLebih
                        ? 'Dana disetujui tidak boleh melebihi dana diusulkan.'
                        : persenDana != null
                          ? `${persenDana}% dari dana diusulkan.`
                          : 'Reviewer menentukan dana yang disetujui, maksimal sebesar dana diusulkan.'}{' '}
                    Dana final dan tidak dapat diubah setelah review diselesaikan.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    Pendanaan
                  </p>
                  <div className="overflow-hidden rounded-xl border border-slate-300">
                    <div className="grid grid-cols-2 border-b border-slate-300 bg-slate-50 text-center text-xs font-semibold text-slate-600">
                      <span className="border-r border-slate-300 px-3 py-2">Dana disetujui</span>
                      <span className="px-3 py-2">Realisasi anggaran</span>
                    </div>
                    <div className="grid grid-cols-2 text-center text-sm">
                      <span className="border-r border-slate-300 px-3 py-3 font-bold italic text-navy-950">{danaLaporan == null ? '—' : rupiahId(danaLaporan)}</span>
                      <span className="px-3 py-3 text-slate-700">{rupiahId(item.realisasiAnggaran)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">Dana disetujui ditetapkan saat review proposal dan tidak berubah di tahap laporan.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Ringkasan & aksi */}
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-6">
          <section className="card space-y-4 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Ringkasan penilaian</h2>
              <span className="text-xs text-slate-500">
                {hasil.terisi}/{KOMPONEN.length} dinilai
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-navy-700 transition-[width] duration-300" style={{ width: `${(hasil.terisi / KOMPONEN.length) * 100}%` }} />
            </div>
            <div className="flex items-end gap-3">
              <span className="font-serif text-5xl leading-none text-navy-950">{angkaId(hasil.rata)}</span>
              <span className="pb-1 text-sm text-slate-500">rata-rata · total {hasil.terisi ? hasil.total : '—'}</span>
            </div>
            {hasil.kelayakan ? <span className={`badge ${TONE[hasil.kelayakan.tone].badge}`}>{hasil.kelayakan.label}</span> : <p className="text-xs text-slate-500">Isi skor untuk melihat kelayakan.</p>}
            <dl className="space-y-2 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Rekomendasi</dt>
                <dd className="text-right font-medium text-navy-900">{form.rekomendasi ? labelRekomendasi(form.rekomendasi) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Dana disetujui</dt>
                <dd className="text-right font-medium text-navy-900">{(pakaiDana ? dana : danaLaporan) == null ? '—' : rupiahId(pakaiDana ? dana : danaLaporan)}</dd>
              </div>
            </dl>
          </section>

          {msg ? (
            <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg border px-3.5 py-2.5 text-sm ${msg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {msg.text}
            </p>
          ) : null}

          <div className="grid gap-2">
            {!baca ? (
              <>
                <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={selesaikan}>
                  <Send className="size-4" aria-hidden="true" />
                  {busy === 'final' ? 'Memproses…' : 'Selesaikan review'}
                </button>
                <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={simpan}>
                  <Save className="size-4" aria-hidden="true" />
                  {busy === 'save' ? 'Menyimpan…' : 'Simpan draf'}
                </button>
              </>
            ) : null}
            <button type="button" className="btn btn-ghost border border-slate-200" onClick={cetak}>
              <Printer className="size-4" aria-hidden="true" />
              Cetak form (PDF)
            </button>
          </div>
          {!baca ? (
            <p className="text-xs leading-relaxed text-slate-500">
              Simpan draf untuk melanjutkan nanti (dari perangkat mana pun). Setelah review diselesaikan, penilaian{pakaiDana ? ' dan dana disetujui' : ''} tidak dapat diubah.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
