// Label opsi reviewer dari GET /users/kandidat-reviewer (W-32): beban tugasan aktif,
// "diprioritaskan" bila belum ada tugasan aktif, dan tanda sudah ditugaskan.
export function labelKandidat(k) {
  const nama = k.fullName || k.name
  if (k.sudahDitugaskan) return `${nama} — sudah ditugaskan`
  if (k.prioritas) return `${nama} — belum ada tugasan (diprioritaskan)`
  return `${nama} — ${k.tugasanBelumSelesai ?? 0} tugasan aktif`
}
