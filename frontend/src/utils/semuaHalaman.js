// Ambil semua halaman endpoint daftar berpaginasi (limit 100, maks `maksHalaman` halaman).
//   fetchPage(params) → Promise respons axios { data: { data, meta: { total } } }
// Hasil: { items, total, terpotong } — terpotong = data melebihi batas halaman.
export async function semuaHalaman(fetchPage, params = {}, maksHalaman = 20) {
  const items = []
  let total = 0
  for (let page = 1; page <= maksHalaman; page += 1) {
    const r = await fetchPage({ ...params, page, limit: 100 })
    const rows = r.data.data || []
    total = Number(r.data.meta?.total) || 0
    items.push(...rows)
    if (!rows.length || items.length >= total) break
  }
  return { items, total, terpotong: items.length < total }
}
