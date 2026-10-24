import { useState, useEffect } from 'react'
import { usersApi } from '../api/users'
import useAuthStore from '../store/authStore'

export default function ProfileModal({ onClose }) {
  const { user, fetchMe } = useAuthStore()
  const [tab, setTab] = useState('profil') // 'profil' | 'password'

  // --- Edit Profil ---
  const [form, setForm] = useState({
    name: '',
    fullName: '',
    noHp: '',
    kontak: '',
    alamat: '',
    institusi: '',
    programStudi: '',
    prodi: '',
    tempatLahir: '',
    tanggalLahir: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null) // { type: 'success'|'error', text }

  // --- Ganti Password ---
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        fullName: user.fullName || '',
        noHp: user.noHp || '',
        kontak: user.kontak || '',
        alamat: user.alamat || '',
        institusi: user.institusi || '',
        programStudi: user.programStudi || '',
        prodi: user.prodi || '',
        tempatLahir: user.tempatLahir || '',
        tanggalLahir: user.tanggalLahir ? user.tanggalLahir.slice(0, 10) : '',
      })
    }
  }, [user])

  const handleSaveProfil = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveMsg(null)
    try {
      const payload = { ...form }
      if (!payload.tanggalLahir) delete payload.tanggalLahir
      await usersApi.updateProfile(payload)
      await fetchMe()
      setSaveMsg({ type: 'success', text: 'Profil berhasil disimpan.' })
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.response?.data?.message || 'Gagal menyimpan profil.' })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwMsg(null)
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ type: 'error', text: 'Konfirmasi password tidak cocok.' })
      return
    }
    setPwSaving(true)
    try {
      await usersApi.changePassword(pwForm.oldPassword, pwForm.newPassword)
      setPwMsg({ type: 'success', text: 'Password berhasil diubah.' })
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.message || 'Gagal mengubah password.' })
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Profil Saya</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5">
          <button
            onClick={() => setTab('profil')}
            className={`py-3 text-sm font-medium mr-5 border-b-2 transition-colors ${
              tab === 'profil' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Edit Profil
          </button>
          <button
            onClick={() => setTab('password')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'password' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Ganti Password
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4">

          {/* === TAB PROFIL === */}
          {tab === 'profil' && (
            <form onSubmit={handleSaveProfil} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nama Panggilan</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Nama panggilan"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nama Lengkap</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={form.fullName}
                    onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                    placeholder="Nama lengkap"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input
                  className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
                  value={user?.email || ''}
                  disabled
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">No. HP</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={form.noHp}
                    onChange={e => setForm(f => ({ ...f, noHp: e.target.value }))}
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Kontak</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={form.kontak}
                    onChange={e => setForm(f => ({ ...f, kontak: e.target.value }))}
                    placeholder="Kontak alternatif"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Institusi</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  value={form.institusi}
                  onChange={e => setForm(f => ({ ...f, institusi: e.target.value }))}
                  placeholder="Nama institusi"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Program Studi</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={form.programStudi}
                    onChange={e => setForm(f => ({ ...f, programStudi: e.target.value }))}
                    placeholder="Program studi"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Prodi</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={form.prodi}
                    onChange={e => setForm(f => ({ ...f, prodi: e.target.value }))}
                    placeholder="Kode prodi"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tempat Lahir</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={form.tempatLahir}
                    onChange={e => setForm(f => ({ ...f, tempatLahir: e.target.value }))}
                    placeholder="Kota lahir"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tanggal Lahir</label>
                  <input
                    type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    value={form.tanggalLahir}
                    onChange={e => setForm(f => ({ ...f, tanggalLahir: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Alamat</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                  rows={2}
                  value={form.alamat}
                  onChange={e => setForm(f => ({ ...f, alamat: e.target.value }))}
                  placeholder="Alamat lengkap"
                />
              </div>

              {saveMsg && (
                <p className={`text-sm ${saveMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {saveMsg.text}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Menyimpan...' : 'Simpan Profil'}
              </button>
            </form>
          )}

          {/* === TAB PASSWORD === */}
          {tab === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Password Lama</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  value={pwForm.oldPassword}
                  onChange={e => setPwForm(f => ({ ...f, oldPassword: e.target.value }))}
                  placeholder="Password saat ini"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Password Baru</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  value={pwForm.newPassword}
                  onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                  placeholder="Password baru"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Konfirmasi Password Baru</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  value={pwForm.confirmPassword}
                  onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Ulangi password baru"
                  required
                />
              </div>

              {pwMsg && (
                <p className={`text-sm ${pwMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {pwMsg.text}
                </p>
              )}

              <button
                type="submit"
                disabled={pwSaving}
                className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {pwSaving ? 'Menyimpan...' : 'Ubah Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
