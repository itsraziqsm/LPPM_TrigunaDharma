import { useEffect, useState } from 'react'
import { periodeApi } from '../api/periode'

// ---------------------------------------------------------------------------
// Logika bersama "Dokumen Masuk" (Ketua/Admin): Proposal Kegiatan (/proposals)
// dan Laporan Kegiatan (/laporan-masuk). Hanya memuat dokumen dari periode
// AKTIF (Periode.isAktif). Filter bawaan "Perlu ditangani" = diajukan (belum
// ada reviewer) + review (menunggu keputusan). Dokumen periode lama dilihat
// lewat menu Periode → pilih periode (tab Proposal / Laporan).
// Endpoint daftar hanya menerima satu periodeId & satu status, jadi data
// diambil per periode × status (limit 100) lalu digabung; pemanggil
// memaginasi hasilnya di peramban.
//   fetchList(params) → Promise respons axios { data: { data, meta: { total } } }
//   (wajib stabil, mis. didefinisikan di luar komponen)
// ---------------------------------------------------------------------------

export const FILTERS_MASUK = [
  { key: 'perlu', label: 'Perlu ditangani', statuses: ['diajukan', 'review'] },
  { key: 'revisi', label: 'Revisi', statuses: ['revisi'] },
  { key: 'disetujui', label: 'Disetujui', statuses: ['disetujui'] },
  { key: 'ditolak', label: 'Ditolak', statuses: ['ditolak'] },
  { key: 'semua', label: 'Semua', statuses: [null] },
]
export const FETCH_LIMIT = 100

const waktu = (x) => new Date(x.submittedAt || x.updatedAt || x.createdAt || 0).getTime()
const totalOf = (r) => Number(r.data.meta?.total) || 0

export default function useDokumenMasuk({ fetchList, filter, periodeId, jenis, query, tick }) {
  const [periodes, setPeriodes] = useState(null) // periode aktif; null = memuat
  const [periodeFailed, setPeriodeFailed] = useState(false)
  const [counts, setCounts] = useState({})
  const [all, setAll] = useState([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    periodeApi
      .getAll()
      .then((r) => alive && setPeriodes((r.data.data || []).filter((p) => p.isAktif)))
      .catch(() => {
        if (!alive) return
        setPeriodes([])
        setPeriodeFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  // Jumlah "perlu ditangani" per periode aktif (meta.total, limit 1).
  useEffect(() => {
    if (!periodes?.length) return undefined
    let alive = true
    Promise.all(
      periodes.map((p) =>
        Promise.all(['diajukan', 'review'].map((st) => fetchList({ periodeId: p.id, status: st, page: 1, limit: 1 })))
          .then((rs) => [p.id, rs.reduce((n, r) => n + totalOf(r), 0)])
          .catch(() => [p.id, null]),
      ),
    ).then((pairs) => alive && setCounts(Object.fromEntries(pairs)))
    return () => {
      alive = false
    }
  }, [periodes, fetchList, tick])

  const targetKey = (periodes || [])
    .filter((p) => (periodeId ? String(p.id) === periodeId : true) && (jenis ? p.jenis === jenis : true))
    .map((p) => p.id)
    .join(',')

  useEffect(() => {
    if (periodes === null) return undefined
    let alive = true
    const ids = targetKey ? targetKey.split(',') : []
    const statuses = (FILTERS_MASUK.find((f) => f.key === filter) || FILTERS_MASUK[0]).statuses
    setLoading(true)
    setFailed(false)
    Promise.all(
      ids.flatMap((id) =>
        statuses.map((st) => fetchList({ periodeId: id, page: 1, limit: FETCH_LIMIT, ...(st ? { status: st } : {}), ...(query ? { search: query } : {}) })),
      ),
    )
      .then((rs) => {
        if (!alive) return
        const seen = new Set()
        setAll(
          rs
            .flatMap((r) => r.data.data || [])
            .filter((x) => x.status !== 'draft' && !seen.has(x.id) && seen.add(x.id))
            .sort((a, b) => waktu(b) - waktu(a)),
        )
        setTruncated(rs.some((r) => totalOf(r) > FETCH_LIMIT))
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [periodes, targetKey, filter, query, fetchList, tick])

  return { periodes, periodeFailed, counts, all, truncated, loading, failed, noPeriode: periodes !== null && periodes.length === 0 }
}
