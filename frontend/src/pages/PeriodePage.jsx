import { useEffect, useState, useCallback } from 'react'
import { periodeApi } from '../api/periode'
import useAuthStore from '../store/authStore'
import { getRoleNames, JENIS_LABEL, EMPTY_FORM } from './periode/periodeConstants'
import { Badge, Modal } from './periode/periodeComponents'
import ProposalPanel from './periode/ProposalPanel'
import { KepalaMasuk } from '../components/PeriodeAktif'
import useJejakMenu from '../hooks/useJejakMenu'
import { Plus } from 'lucide-react'

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PeriodePage() {
  const { user } = useAuthStore()
  const roleNames = getRoleNames(user?.roles)
  const isAdmin = roleNames.includes('admin')
  const induk = useJejakMenu('akademik')
  const isKetua = roleNames.includes('ketua_lppm')
  const canManage = isAdmin || isKetua
  // Hak akses periode (new-api.md bagian 20): Ketua tambah/ubah/hapus langsung
  // (DELETE /periode/:id + password sendiri) dan menyetujui permintaan hapus admin;
  // Admin hanya melihat, hapus lewat permintaan yang disetujui Ketua.
  const canEdit = isKetua

  const [periodes, setPeriodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activePeriode, setActivePeriode] = useState(null)

  const [modal, setModal] = useState(null) // null | 'create' | 'edit' | 'delete'
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // 2-Step Delete state
  // deleteStep: 'request' = step 1 (inisiasi), 'pending' = sudah ada request, 'approve' = form approve
  const [deleteStep, setDeleteStep] = useState('request')
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordError, setDeletePasswordError] = useState(null)
  const [pendingRequest, setPendingRequest] = useState(null)

  const fetchPeriodes = useCallback(async () => {
    try {
      setLoading(true)
      const res = await periodeApi.getAll()
      setPeriodes(res.data.data || [])
    } catch {
      setError('Gagal memuat data periode')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPeriodes() }, [fetchPeriodes])

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_FORM); setFormError(null); setSelected(null); setModal('create')
  }

  const openEdit = (p, e) => {
    e.stopPropagation(); setSelected(p)
    setForm({
      nama: p.nama, tahun: p.tahun, jenis: p.jenis,
      tanggalMulai: p.tanggalMulai?.slice(0, 10),
      tanggalSelesai: p.tanggalSelesai?.slice(0, 10),
      isAktif: p.isAktif,
    })
    setFormError(null); setModal('edit')
  }

  const openDelete = async (p, e) => {
    e.stopPropagation()
    setSelected(p)
    setDeletePassword('')
    setDeletePasswordError(null)
    setFormError(null)

    // Cek apakah sudah ada pending request untuk periode ini
    try {
      const res = await periodeApi.getPendingDeletionRequest(p.id)
      const req = res.data.data
      if (req) {
        setPendingRequest(req)
        // Jika user ini adalah requester → tampilkan status pending
        // Jika user ini bukan requester → langsung ke step approve
        // Ketua menyetujui/menolak permintaan admin; admin hanya bisa memantau/membatalkan.
        setDeleteStep(isKetua ? 'approve' : 'pending')
      } else {
        setPendingRequest(null)
        setDeleteStep(isKetua ? 'direct' : 'request')
      }
    } catch {
      setPendingRequest(null)
      setDeleteStep(isKetua ? 'direct' : 'request')
    }

    setModal('delete')
  }

  const closeModal = () => {
    setModal(null); setSelected(null); setFormError(null)
    setDeletePassword(''); setDeletePasswordError(null)
    setPendingRequest(null); setDeleteStep('request')
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((f) => ({
      ...f,
      [name]: type === 'checkbox' ? checked : name === 'tahun' ? Number(value) : value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setFormError(null)
    if (!form.nama || !form.tanggalMulai || !form.tanggalSelesai) {
      setFormError('Semua field wajib diisi'); return
    }
    if (new Date(form.tanggalSelesai) <= new Date(form.tanggalMulai)) {
      setFormError('Tanggal selesai harus setelah tanggal mulai'); return
    }
    setSubmitting(true)
    try {
      if (modal === 'create') await periodeApi.create(form)
      else await periodeApi.update(selected.id, form)
      await fetchPeriodes(); closeModal()
    } catch (err) {
      setFormError(err.response?.data?.message || 'Terjadi kesalahan')
    } finally { setSubmitting(false) }
  }

  // ── 2-Step Delete handlers ─────────────────────────────────────────────────

  const handleRequestDelete = async () => {
    setDeletePasswordError(null)
    if (!deletePassword) { setDeletePasswordError('Password wajib diisi'); return }
    setSubmitting(true)
    try {
      const res = await periodeApi.requestDelete(selected.id, deletePassword)
      const { requestId, expiresAt } = res.data.data
      setPendingRequest({ id: requestId, expiresAt, requester: { id: user.id, name: user.name } })
      setDeletePassword('')
      setDeleteStep('pending')
    } catch (err) {
      const msg = err.response?.data?.message || 'Terjadi kesalahan'
      if (msg.toLowerCase().includes('password')) {
        setDeletePasswordError('Password salah. Coba lagi.')
      } else {
        setFormError(msg)
      }
    } finally { setSubmitting(false) }
  }

  const handleApproveDelete = async () => {
    setDeletePasswordError(null)
    if (!deletePassword) { setDeletePasswordError('Password wajib diisi'); return }
    setSubmitting(true)
    try {
      await periodeApi.approveDelete(pendingRequest.id, deletePassword)
      if (activePeriode?.id === selected.id) setActivePeriode(null)
      await fetchPeriodes(); closeModal()
    } catch (err) {
      const msg = err.response?.data?.message || 'Terjadi kesalahan'
      if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('salah')) {
        setDeletePasswordError('Password salah. Coba lagi.')
      } else {
        setFormError(msg)
      }
    } finally { setSubmitting(false) }
  }

  // Ketua: hapus langsung (DELETE /periode/:id { password })
  const handleDirectDelete = async () => {
    setDeletePasswordError(null)
    if (!deletePassword) { setDeletePasswordError('Password wajib diisi'); return }
    setSubmitting(true)
    try {
      await periodeApi.remove(selected.id, deletePassword)
      if (activePeriode?.id === selected.id) setActivePeriode(null)
      await fetchPeriodes(); closeModal()
    } catch (err) {
      const msg = err.response?.data?.message || 'Terjadi kesalahan'
      if (msg.toLowerCase().includes('password')) {
        setDeletePasswordError(msg === 'Password wajib diisi' ? msg : 'Password salah. Coba lagi.')
      } else {
        setFormError(msg)
      }
    } finally { setSubmitting(false) }
  }

  const handleCancelRequest = async () => {
    setSubmitting(true)
    try {
      await periodeApi.cancelDeleteRequest(pendingRequest.id)
      closeModal()
    } catch (err) {
      setFormError(err.response?.data?.message || 'Gagal membatalkan')
    } finally { setSubmitting(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="page space-y-8">
        {/* Kepala: judul + breadcrumb, lalu ringkasan (gaya Undangan) */}
        <KepalaMasuk
          judul="Periode Penelitian & Pengabdian"
          crumbs={[...induk, { label: 'Periode' }]}
          desc={
            <>
              Kelola daftar periode secara terstruktur untuk mendukung proses pengajuan, evaluasi, dan pemantauan kegiatan
              penelitian maupun pengabdian.
              {!canEdit && canManage ? (
                <span className="mt-2 block text-sm text-slate-500">
                  Akses Admin: lihat saja. Tombol Hapus mengajukan permintaan penghapusan yang harus disetujui Ketua LPPM.
                </span>
              ) : null}
            </>
          }
          aksi={
            canEdit ? (
              <button onClick={openCreate} className="btn btn-primary">
                <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
                Tambah Periode
              </button>
            ) : null
          }
          stats={[
            { label: 'Total Periode', value: periodes.length },
            { label: 'Periode Aktif', value: periodes.filter((p) => p.isAktif).length },
            {
              label: 'Periode Dipilih',
              value: (
                <span className="block truncate font-sans text-base font-semibold" title={activePeriode?.nama || undefined}>
                  {activePeriode ? activePeriode.nama : '—'}
                </span>
              ),
            },
          ]}
        />

        {/* Daftar Periode */}
        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-navy-950">Daftar Periode</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Pilih satu periode untuk melihat panel proposal, atau gunakan aksi di sisi kanan untuk mengelola data.
                </p>
              </div>
              <div className="text-sm text-slate-400">Klik satu baris untuk membuka detail periode</div>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-14 text-center">
              <p className="flex items-center justify-center gap-3 text-base text-slate-500">
                <span className="spinner text-navy-600" aria-hidden="true" />
                Memuat data periode...
              </p>
            </div>
          ) : error ? (
            <div className="px-6 py-14 text-center">
              <p className="text-base text-red-600">{error}</p>
            </div>
          ) : periodes.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-base text-slate-500">Belum ada periode yang tersedia.</p>
            </div>
          ) : (
            <>
              <div className="hidden border-b border-slate-200 bg-slate-50 px-6 py-3 md:grid md:grid-cols-12 md:gap-4">
                <span className="col-span-4 text-xs font-semibold text-slate-500">Periode</span>
                <span className="col-span-2 text-xs font-semibold text-slate-500">Jenis</span>
                <span className="col-span-2 text-xs font-semibold text-slate-500">Tahun</span>
                <span className="col-span-2 text-xs font-semibold text-slate-500">Status</span>
                <span className="col-span-2 text-right text-xs font-semibold text-slate-500">Tindakan</span>
              </div>

              <div className="divide-y divide-slate-100">
                {periodes.map((p) => {
                  const isActive = activePeriode?.id === p.id
                  return (
                    <article
                      key={p.id}
                      onClick={() => setActivePeriode((prev) => (prev?.id === p.id ? null : p))}
                      className={`cursor-pointer px-6 py-4 transition-colors duration-150 ${isActive ? 'bg-navy-50' : 'hover:bg-slate-50'}`}
                    >
                      {/* Desktop */}
                      <div className="hidden md:grid md:grid-cols-12 md:items-center md:gap-4">
                        <div className="col-span-4">
                          <p className="text-base font-semibold leading-snug text-slate-900">{p.nama}</p>
                          <p className="mt-0.5 text-sm text-slate-500 tabular-nums">
                            {p.tanggalMulai?.slice(0, 10)} — {p.tanggalSelesai?.slice(0, 10)}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <Badge
                            label={JENIS_LABEL[p.jenis] || p.jenis}
                            className="badge-neutral"
                          />
                        </div>
                        <div className="col-span-2">
                          <span className="text-base text-slate-700 tabular-nums">{p.tahun}</span>
                        </div>
                        <div className="col-span-2">
                          <Badge
                            label={p.isAktif ? 'Aktif' : 'Nonaktif'}
                            className={p.isAktif ? 'badge-success' : 'badge-neutral'}
                          />
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-1">
                          {canManage && (
                            <>
                              {canEdit && (
                                <button
                                  onClick={(e) => openEdit(p, e)}
                                  className="btn btn-ghost btn-sm"
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                onClick={(e) => openDelete(p, e)}
                                className="btn btn-ghost btn-sm text-red-700 hover:bg-red-50 hover:text-red-800"
                              >
                                Hapus
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Mobile */}
                      <div className="space-y-3 md:hidden">
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-base font-semibold leading-snug text-slate-900">{p.nama}</h3>
                            <Badge
                              label={p.isAktif ? 'Aktif' : 'Nonaktif'}
                              className={p.isAktif ? 'badge-success' : 'badge-neutral'}
                            />
                          </div>
                          <p className="text-sm text-slate-500 tabular-nums">
                            {p.tanggalMulai?.slice(0, 10)} — {p.tanggalSelesai?.slice(0, 10)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge
                            label={JENIS_LABEL[p.jenis] || p.jenis}
                            className="badge-neutral"
                          />
                          <span className="text-sm text-slate-600">Tahun {p.tahun}</span>
                        </div>
                        {canManage && (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            {canEdit && (
                              <button
                                onClick={(e) => openEdit(p, e)}
                                className="btn btn-secondary btn-sm"
                              >
                                Edit Periode
                              </button>
                            )}
                            <button
                              onClick={(e) => openDelete(p, e)}
                              className="btn btn-danger btn-sm"
                            >
                              Hapus Periode
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Proposal Panel */}
      {activePeriode && (
        <ProposalPanel
          key={activePeriode.id}
          periode={activePeriode}
          isKetua={isKetua}
          onClose={() => setActivePeriode(null)}
        />
      )}

      {/* Create / Edit Modal */}
      {canEdit && (modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'Tambah Periode' : 'Edit Periode'} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-6">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700" role="alert">
                {formError}
              </div>
            )}
            <section className="space-y-5">
              <div>
                <label htmlFor="periode-nama" className="label">Nama Periode</label>
                <input
                  id="periode-nama"
                  type="text" name="nama" value={form.nama} onChange={handleFormChange}
                  placeholder="cth. Periode Genap 2024/2025"
                  className="input"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="periode-tahun" className="label">Tahun</label>
                  <input
                    id="periode-tahun"
                    type="number" name="tahun" value={form.tahun} onChange={handleFormChange}
                    min={2000} max={2100}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="periode-jenis" className="label">Jenis</label>
                  <select
                    id="periode-jenis"
                    name="jenis" value={form.jenis} onChange={handleFormChange}
                    className="input"
                  >
                    <option value="penelitian">Penelitian</option>
                    <option value="pengabdian">Pengabdian</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="periode-mulai" className="label">Tanggal Mulai</label>
                  <input
                    id="periode-mulai"
                    type="date" name="tanggalMulai" value={form.tanggalMulai} onChange={handleFormChange}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="periode-selesai" className="label">Tanggal Selesai</label>
                  <input
                    id="periode-selesai"
                    type="date" name="tanggalSelesai" value={form.tanggalSelesai} onChange={handleFormChange}
                    className="input"
                  />
                </div>
              </div>
            </section>
            <section className="rounded-lg bg-slate-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox" id="isAktif" name="isAktif" checked={form.isAktif}
                  onChange={handleFormChange}
                  className="mt-1 size-4 rounded border-slate-300 accent-navy-800"
                />
                <div>
                  <label htmlFor="isAktif" className="text-base font-medium text-slate-900">
                    Tetapkan sebagai periode aktif
                  </label>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                    Gunakan opsi ini jika periode sedang dibuka dan perlu ditampilkan sebagai periode aktif.
                  </p>
                </div>
              </div>
            </section>
            <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button" onClick={closeModal}
                className="btn btn-secondary"
              >
                Batal
              </button>
              <button
                type="submit" disabled={submitting}
                className="btn btn-primary"
              >
                {submitting ? 'Menyimpan...' : modal === 'create' ? 'Tambah Periode' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Modal — 2-Step */}
      {modal === 'delete' && selected && (
        <Modal title="Hapus Periode" onClose={closeModal}>
          <div className="space-y-6">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700" role="alert">
                {formError}
              </div>
            )}

            {/* Peringatan */}
            <section className="space-y-1.5 rounded-lg border border-red-200 bg-red-50 px-5 py-4">
              <p className="text-base font-semibold text-red-800">
                Peringatan: tindakan ini tidak dapat dibatalkan
              </p>
              <p className="text-sm leading-relaxed text-red-700">
                Menghapus periode <span className="font-semibold">"{selected.nama}"</span> akan
                menghapus seluruh proposal terkait beserta data reviewnya.
              </p>
            </section>

            {/* Progress indicator (alur 2 langkah admin → Ketua) */}
            {deleteStep !== 'direct' && (
            <div className="flex items-center gap-3">
              <div className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${deleteStep === 'request' ? 'bg-navy-800 text-white' : 'bg-green-100 text-green-700'}`}>
                {deleteStep === 'request' ? '1' : '✓'}
              </div>
              <div className={`h-0.5 flex-1 ${deleteStep === 'pending' || deleteStep === 'approve' ? 'bg-slate-300' : 'bg-slate-200'}`} />
              <div className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${deleteStep === 'approve' ? 'bg-navy-800 text-white' : deleteStep === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                2
              </div>
              <p className="ml-1 text-xs text-slate-500">
                {deleteStep === 'request' && 'Langkah 1: Inisiasi'}
                {deleteStep === 'pending' && 'Menunggu persetujuan'}
                {deleteStep === 'approve' && 'Langkah 2: Persetujuan'}
              </p>
            </div>
            )}

            {/* Ketua: hapus langsung dengan password sendiri */}
            {deleteStep === 'direct' && (
              <section className="space-y-4">
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-sm leading-relaxed text-slate-600">
                    Sebagai Ketua LPPM, Anda dapat menghapus periode ini secara langsung. Masukkan password
                    Anda untuk konfirmasi.
                  </p>
                </div>
                <div>
                  <label htmlFor="direct-password" className="label">
                    Password Anda
                  </label>
                  <input
                    id="direct-password"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => { setDeletePassword(e.target.value); setDeletePasswordError(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && deletePassword && !submitting) handleDirectDelete() }}
                    placeholder="Masukkan password login Anda"
                    className={`input ${deletePasswordError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : ''}`}
                  />
                  {deletePasswordError && (
                    <p className="mt-2 text-sm text-red-600">{deletePasswordError}</p>
                  )}
                </div>
                <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
                  <button onClick={closeModal} className="btn btn-secondary">
                    Batal
                  </button>
                  <button
                    onClick={handleDirectDelete}
                    disabled={submitting || !deletePassword}
                    className="btn btn-destructive"
                  >
                    {submitting ? 'Menghapus...' : 'Hapus Periode'}
                  </button>
                </div>
              </section>
            )}

            {/* Step 1: Request */}
            {deleteStep === 'request' && (
              <section className="space-y-4">
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-sm leading-relaxed text-slate-600">
                    Admin tidak dapat menghapus periode secara langsung. Permintaan penghapusan
                    dikirim ke Ketua LPPM untuk disetujui. Masukkan password Anda untuk mengajukan.
                  </p>
                </div>
                <div>
                  <label htmlFor="hapus-password" className="label">
                    Password Anda
                  </label>
                  <input
                    id="hapus-password"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => { setDeletePassword(e.target.value); setDeletePasswordError(null) }}
                    placeholder="Masukkan password login Anda"
                    className={`input ${deletePasswordError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : ''}`}
                  />
                  {deletePasswordError && (
                    <p className="mt-2 text-sm text-red-600">{deletePasswordError}</p>
                  )}
                </div>
                <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
                  <button onClick={closeModal} className="btn btn-secondary">
                    Batal
                  </button>
                  <button
                    onClick={handleRequestDelete}
                    disabled={submitting || !deletePassword}
                    className="btn btn-destructive"
                  >
                    {submitting ? 'Memproses...' : 'Ajukan ke Ketua LPPM'}
                  </button>
                </div>
              </section>
            )}

            {/* Step pending: sudah diajukan, menunggu approver */}
            {deleteStep === 'pending' && pendingRequest && (
              <section className="space-y-4">
                <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-sm font-semibold text-amber-800">Permintaan sedang menunggu persetujuan</p>
                  <p className="text-sm leading-relaxed text-amber-800/90">
                    {pendingRequest.requester?.id && pendingRequest.requester.id !== user?.id
                      ? `Diajukan oleh ${pendingRequest.requester.name}. `
                      : ''}
                    Notifikasi telah dikirim ke Ketua LPPM. Permintaan ini berlaku
                    hingga <span className="font-medium">{new Date(pendingRequest.expiresAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>.
                  </p>
                </div>
                <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
                  <button
                    onClick={handleCancelRequest}
                    disabled={submitting}
                    className="btn btn-secondary"
                  >
                    {submitting ? 'Membatalkan...' : 'Batalkan Permintaan'}
                  </button>
                  <button onClick={closeModal} className="btn btn-primary">
                    Tutup
                  </button>
                </div>
              </section>
            )}

            {/* Step 2: Approve */}
            {deleteStep === 'approve' && pendingRequest && (
              <section className="space-y-4">
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-sm leading-relaxed text-slate-600">
                    Admin <span className="font-semibold text-slate-800">{pendingRequest.requester?.name}</span> mengajukan
                    penghapusan periode ini. Masukkan password Anda untuk menyetujui dan menghapus, atau tolak permintaannya.
                  </p>
                </div>
                <div>
                  <label htmlFor="approve-password" className="label">
                    Password Anda (sebagai approver)
                  </label>
                  <input
                    id="approve-password"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => { setDeletePassword(e.target.value); setDeletePasswordError(null) }}
                    placeholder="Masukkan password login Anda"
                    className={`input ${deletePasswordError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : ''}`}
                  />
                  {deletePasswordError && (
                    <p className="mt-2 text-sm text-red-600">{deletePasswordError}</p>
                  )}
                </div>
                <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
                  <button
                    onClick={handleCancelRequest}
                    disabled={submitting}
                    className="btn btn-secondary"
                  >
                    Tolak
                  </button>
                  <button
                    onClick={handleApproveDelete}
                    disabled={submitting || !deletePassword}
                    className="btn btn-destructive"
                  >
                    {submitting ? 'Menghapus...' : 'Setujui & Hapus Periode'}
                  </button>
                </div>
              </section>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
