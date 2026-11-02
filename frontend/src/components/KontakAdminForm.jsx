import { useEffect, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { kontakAdminApi } from '../api/kontakAdmin'
import { setKontakAdmin } from '../utils/hubungiAdmin'

// Pengaturan › Kontak Admin (khusus admin, W-50): nomor WhatsApp, nama, & jam layanan yang dipakai tombol
// Alat › Hubungi Admin semua peran. GET/PATCH /kontak-admin; server menormalkan nomor ke 62… (400 bila tidak valid).

const tanggal = (v) => (v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

export default function KontakAdminForm({ SettingsCard, Field, Message }) {
  const [awal, setAwal] = useState(null)
  const [form, setForm] = useState({ whatsapp: '', nama: '', jamLayanan: '' })
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    kontakAdminApi
      .get()
      .then((r) => {
        if (!alive) return
        const d = r.data.data || {}
        setAwal(d)
        setForm({ whatsapp: d.whatsapp || '', nama: d.nama || '', jamLayanan: d.jamLayanan || '' })
      })
      .catch(() => alive && setMsg({ type: 'error', text: 'Kontak admin gagal dimuat.' }))
    return () => {
      alive = false
    }
  }, [])

  const berubah = awal && (form.whatsapp !== (awal.whatsapp || '') || form.nama !== (awal.nama || '') || form.jamLayanan !== (awal.jamLayanan || ''))

  const simpan = async (e) => {
    e.preventDefault()
    if (!berubah) return
    setSaving(true)
    setMsg(null)
    const body = {}
    if (form.whatsapp !== (awal.whatsapp || '')) body.whatsapp = form.whatsapp.trim() || null
    if (form.nama !== (awal.nama || '')) body.nama = form.nama.trim() || null
    if (form.jamLayanan !== (awal.jamLayanan || '')) body.jamLayanan = form.jamLayanan.trim() || null
    try {
      const r = await kontakAdminApi.update(body)
      const d = r.data.data || {}
      setAwal(d)
      setForm({ whatsapp: d.whatsapp || '', nama: d.nama || '', jamLayanan: d.jamLayanan || '' })
      setKontakAdmin(d)
      setMsg({ type: 'success', text: 'Kontak admin diperbarui.' })
    } catch (err) {
      const errs = err.response?.data?.errors
      setMsg({ type: 'error', text: errs ? Object.values(errs).flat().join(' ') : err.response?.data?.message || 'Kontak admin gagal disimpan.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard id="kontak-admin" title="Kontak Admin" desc="Nomor WhatsApp yang dibuka semua pengguna lewat tombol Alat › Hubungi Admin.">
      <form onSubmit={simpan} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="ka-wa" label="Nomor WhatsApp" hint="Mis. 0812-3456-7890 atau +62 812…; disimpan sebagai 62…. Kosongkan untuk menonaktifkan.">
            <input id="ka-wa" inputMode="tel" className="input" value={form.whatsapp} disabled={!awal} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} placeholder="6281234567890" />
          </Field>
          <Field id="ka-nama" label="Nama kontak">
            <input id="ka-nama" className="input" maxLength={100} value={form.nama} disabled={!awal} onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))} placeholder="Admin LPPM" />
          </Field>
          <Field id="ka-jam" label="Jam layanan" wide>
            <input id="ka-jam" className="input" maxLength={100} value={form.jamLayanan} disabled={!awal} onChange={(e) => setForm((f) => ({ ...f, jamLayanan: e.target.value }))} placeholder="Senin–Jumat 08.00–16.00" />
          </Field>
        </div>
        {awal?.updatedAt ? (
          <p className="text-xs text-slate-500">
            Terakhir diubah {tanggal(awal.updatedAt)}
            {awal.updatedBy ? ` oleh ${awal.updatedBy.fullName || awal.updatedBy.name}` : ''}.
          </p>
        ) : null}
        <Message msg={msg} />
        <div className="flex justify-end border-t border-slate-200 pt-5">
          <button type="submit" disabled={saving || !berubah} className="btn btn-primary sm:min-w-32">
            <MessageSquareText className="size-4" aria-hidden="true" />
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </SettingsCard>
  )
}
