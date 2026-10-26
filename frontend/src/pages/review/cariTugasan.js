// Tugasan review milik user untuk satu item (tidak ada endpoint detail tugasan):
// telusuri daftar tugasan (maks. 5 × 100) lalu cocokkan id item.
//   fetchPage({ page, limit }) → axios response { data: { data, meta } }
export async function cariTugasan(fetchPage, cocok) {
  for (let page = 1; page <= 5; page += 1) {
    const r = await fetchPage({ page, limit: 100 })
    const rows = r.data.data || []
    const hit = rows.find(cocok)
    if (hit) return hit
    const total = Number(r.data.meta?.total) || 0
    if (rows.length < 100 || page * 100 >= total) break
  }
  return null
}
