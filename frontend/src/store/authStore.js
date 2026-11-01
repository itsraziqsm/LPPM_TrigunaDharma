import { create } from 'zustand'
import { authApi } from '../api/auth'

const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken') || null,
  refreshToken: localStorage.getItem('refreshToken') || null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { data } = await authApi.login(email, password)
      const { accessToken, refreshToken, user } = data.data
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
      // Simpan user dari login dulu, lalu langsung fetchMe untuk dapat hasTugasan
      set({ user, accessToken, refreshToken, loading: false })
      // fetchMe segera setelah login agar hasTugasan langsung tersedia
      try {
        const me = await authApi.me()
        set({ user: me.data.data })
      } catch { /* ignore, user dari login tetap tersimpan */ }
      return user
    } catch (err) {
      const msg = err.response?.data?.message || 'Login gagal'
      set({ error: msg, loading: false })
      throw new Error(msg)
    }
  },

  register: async (type, formData) => {
    set({ loading: true, error: null })
    try {
      const fn = type === 'dosen' ? authApi.registerDosen : authApi.registerMahasiswa
      const { data } = await fn(formData)
      set({ loading: false })
      return data
    } catch (err) {
      const res = err.response
      const msg = res?.data?.message || 'Registrasi gagal'
      set({ error: msg, loading: false })
      // Bawa status, kode (W-48: PENDAFTARAN_MENUNGGU | AKUN_SUDAH_AKTIF | IDENTITAS_BENTROK), data & galat per kolom (422).
      const e = new Error(msg)
      e.status = res?.status
      e.code = res?.data?.code
      e.data = res?.data?.data
      e.fieldErrors = res?.data?.errors
      throw e
    }
  },

  logout: async () => {
    try {
      const rt = get().refreshToken
      if (rt) await authApi.logout(rt)
    } catch { /* ignore */ }
    localStorage.clear()
    set({ user: null, accessToken: null, refreshToken: null, loading: false, error: null })
  },

  fetchMe: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const { data } = await authApi.me()
      set({ user: data.data, loading: false })
    } catch {
      // Token tidak valid - paksa logout
      localStorage.clear()
      set({ user: null, accessToken: null, refreshToken: null, loading: false })
    }
  },

  clearError: () => set({ error: null }),
}))

export default useAuthStore
