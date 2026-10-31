// ---------------------------------------------------------------------------
// Riwayat penggunaan per user (localStorage, per peramban; tidak butuh API — tidak perlu
// sinkron antarperangkat). Kunci memakai id user sehingga akun lain di peramban yang sama
// punya riwayat sendiri. Semua akses dibungkus try/catch (mode privat / penyimpanan diblokir).
//   catatKunjungan(userId, path)        — dipanggil DashboardLayout tiap pindah halaman
//   pilihPintasan(userId, shortcuts, n) — pintasan dashboard maks n: yang terakhir dipakai dulu,
//                                         sisanya diisi urutan adapter (= paling penting)
//   riwayatCari(userId) / catatCari(userId, item) — 4 hasil pencarian global terakhir dibuka
// ---------------------------------------------------------------------------

const MAKS_KUNJUNGAN = 50
export const MAKS_PINTASAN = 4
export const MAKS_RIWAYAT_CARI = 4

const baca = (kunci, cadangan) => {
  try {
    const v = JSON.parse(localStorage.getItem(kunci) || 'null')
    return v ?? cadangan
  } catch {
    return cadangan
  }
}
const tulis = (kunci, nilai) => {
  try {
    localStorage.setItem(kunci, JSON.stringify(nilai))
  } catch {
    /* abaikan */
  }
}

const kunciHalaman = (id) => `riwayatHalaman:${id}`
const kunciCari = (id) => `riwayatCari:${id}`
const pathOf = (to) => String(to || '').split(/[?#]/)[0]

export function catatKunjungan(userId, path) {
  if (!userId || !path || path === '/dashboard') return
  const peta = baca(kunciHalaman(userId), {})
  peta[path] = Date.now()
  const urut = Object.entries(peta).sort((a, b) => b[1] - a[1]).slice(0, MAKS_KUNJUNGAN)
  tulis(kunciHalaman(userId), Object.fromEntries(urut))
}

// Waktu terakhir halaman pintasan (atau turunannya, mis. /statistik → /statistik?tab=dosen,
// /daftar-dokumen/proposal → detailnya tidak dihitung) dibuka.
function terakhirDipakai(peta, to) {
  const p = pathOf(to)
  let t = 0
  for (const [path, ts] of Object.entries(peta)) {
    if ((path === p || path.startsWith(`${p}/`)) && ts > t) t = ts
  }
  return t
}

export function pilihPintasan(userId, shortcuts, n = MAKS_PINTASAN) {
  const list = shortcuts || []
  if (list.length <= n) return list
  const peta = userId ? baca(kunciHalaman(userId), {}) : {}
  const berskor = list.map((s, i) => ({ s, i, t: terakhirDipakai(peta, s.to) }))
  const dipakai = berskor.filter((x) => x.t > 0).sort((a, b) => b.t - a.t).slice(0, n)
  const sisa = berskor.filter((x) => !dipakai.includes(x)).slice(0, n - dipakai.length)
  // Tampil dalam urutan adapter agar posisi kartu stabil.
  return [...dipakai, ...sisa].sort((a, b) => a.i - b.i).map((x) => x.s)
}

export function riwayatCari(userId) {
  if (!userId) return []
  const list = baca(kunciCari(userId), [])
  return Array.isArray(list) ? list.slice(0, MAKS_RIWAYAT_CARI) : []
}

export function catatCari(userId, item) {
  if (!userId || !item?.to) return
  const simpan = { key: `riwayat-${item.to}`, to: item.to, title: item.title, subtitle: item.subtitle || null, badge: item.badge || null, badgeClass: item.badgeClass || null }
  const lama = riwayatCari(userId).filter((x) => x.to !== item.to)
  tulis(kunciCari(userId), [simpan, ...lama].slice(0, MAKS_RIWAYAT_CARI))
}

export function hapusRiwayatCari(userId) {
  if (userId) tulis(kunciCari(userId), [])
}
