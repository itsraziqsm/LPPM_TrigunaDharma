import { proposalApi } from '../api/proposal'
import { proposalDosenApi } from '../api/Proposaldosen'
import { laporanApi } from '../api/laporan'
import { usersApi } from '../api/users'
import { laporanHarianApi } from '../api/laporanHarian'
import { JENIS_LABEL, STATUS_COLOR, STATUS_LABEL } from '../pages/ProposalDosen/constants'

// ---------------------------------------------------------------------------
// Pencarian global (components/GlobalSearch): tombol kaca pembesar melayang di
// kanan bawah / Ctrl+F. Hasil = halaman (menu sesuai peran pertama, sama dengan
// Sidebar) + data dari endpoint daftar yang sudah ada (search=, limit kecil):
//   dosen       → proposal (/dosen/proposals) & laporan (/laporan/my)
//   admin/ketua → proposal (/proposals), laporan (/laporan), user (/users)
//   mahasiswa   → proposal tim (laporan harian, disaring lokal)
// Setiap item punya `to` (tujuan navigasi) dan `group` (judul kelompok).
// ---------------------------------------------------------------------------

const UMUM = [
  { to: '/dashboard', title: 'Dashboard', kata: 'beranda home ringkasan' },
  { to: '/notifikasi', title: 'Notifikasi', kata: 'pemberitahuan lonceng' },
  { to: '/profil', title: 'Pengaturan', kata: 'profil akun password foto' },
]

const HALAMAN = {
  pengelola: [
    { to: '/proposals', title: 'Proposal Kegiatan', kata: 'dokumen masuk usulan' },
    { to: '/laporan-masuk', title: 'Laporan Kegiatan', kata: 'laporan masuk dokumen masuk' },
    { to: '/periode', title: 'Periode', kata: 'jadwal tahun' },
    { to: '/users', title: 'Manajemen User', kata: 'pengguna dosen mahasiswa reviewer' },
    { to: '/cetak-dokumen', title: 'Cetak Dokumen', kata: 'print export' },
    { to: '/cetak-dokumen/rekap-proposal', title: 'Rekapitulasi Proposal', kata: 'export excel pdf cetak' },
    { to: '/cetak-dokumen/surat-tugas', title: 'Surat Tugas', kata: 'cetak dokumen' },
  ],
  dosen: [
    { to: '/kegiatan/penelitian', title: 'Status Penelitian', kata: 'kegiatan riwayat' },
    { to: '/kegiatan/pengabdian', title: 'Status Pengabdian', kata: 'kegiatan riwayat' },
    { to: '/kegiatan/penelitian/usulan', title: 'Usulkan Proposal Penelitian', kata: 'baru buat' },
    { to: '/kegiatan/pengabdian/usulan', title: 'Usulkan Proposal Pengabdian', kata: 'baru buat' },
    { to: '/kegiatan/penelitian/laporan/baru', title: 'Kirim Laporan Penelitian', kata: 'baru buat' },
    { to: '/kegiatan/pengabdian/laporan/baru', title: 'Kirim Laporan Pengabdian', kata: 'baru buat' },
    { to: '/luaran', title: 'Luaran', kata: 'pencairan dana' },
    { to: '/undangan', title: 'Undangan Kerja Sama', kata: 'undangan tim anggota' },
  ],
  mahasiswa: [
    { to: '/project/penelitian', title: 'Project Penelitian', kata: 'project saya laporan harian' },
    { to: '/project/pengabdian', title: 'Project Pengabdian', kata: 'project saya laporan harian' },
    { to: '/riwayat-project', title: 'Riwayat Project', kata: 'periode riwayat kegiatan' },
    { to: '/undangan', title: 'Undangan Ikut Serta', kata: 'undangan tim anggota' },
    { to: '/laporan-harian', title: 'Laporan Harian (semua project)', kata: 'kegiatan harian' },
  ],
  admin: [{ to: '/backup', title: 'Backup Data', kata: 'cadangan database unduh' }],
  reviewer: [{ to: '/penugasan', title: 'Penugasan Review', kata: 'tugasan reviewer' }],
}

export function konteksPencarian(roleNames, isReviewer) {
  const primary = roleNames[0] || ''
  const peran = primary === 'admin' || primary === 'ketua_lppm' ? 'pengelola' : primary
  return { peran, isReviewer, isAdmin: primary === 'admin' }
}

function halaman({ peran, isReviewer, isAdmin }) {
  return [...UMUM, ...(HALAMAN[peran] || []), ...(isAdmin ? HALAMAN.admin : []), ...(isReviewer ? HALAMAN.reviewer : [])]
}

const tgl = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : null)

const kegiatanItem = (p, group, to, extra) => ({
  key: `${group}-${p.id}`,
  group,
  to,
  title: p.judul,
  subtitle: [extra, JENIS_LABEL[p.jenis] || p.jenis, p.periode?.nama, tgl(p.updatedAt)].filter(Boolean).join(' · '),
  badge: STATUS_LABEL[p.status] || p.status,
  badgeClass: STATUS_COLOR[p.status],
})

const daftar = (r) => r?.data?.data || []

export async function cariGlobal(q, ctx) {
  const k = q.toLowerCase()
  const pages = halaman(ctx)
    .filter((h) => `${h.title} ${h.kata}`.toLowerCase().includes(k))
    .map((h) => ({ key: `hal-${h.to}`, group: 'Halaman', to: h.to, title: h.title, subtitle: h.to }))
  if (q.length < 2) return pages

  const params = { page: 1, limit: 5, search: q }
  const safe = (promise) => promise.catch(() => null)
  let data = []
  if (ctx.peran === 'dosen') {
    const [prop, lap] = await Promise.all([safe(proposalDosenApi.getAll(params)), safe(laporanApi.getMy(params))])
    data = [
      ...daftar(prop).map((p) => kegiatanItem(p, 'Proposal', `/kegiatan/${p.jenis}/detail/${p.id}`)),
      ...daftar(lap).map((l) => kegiatanItem(l, 'Laporan', `/kegiatan/${l.jenis}/laporan/${l.id}`)),
    ]
  } else if (ctx.peran === 'pengelola') {
    const [prop, lap, usr] = await Promise.all([safe(proposalApi.getAll(params)), safe(laporanApi.getAll(params)), safe(usersApi.getAll(params))])
    const nama = (x) => x.pengusul?.fullName || x.pengusul?.name
    data = [
      ...daftar(prop).map((p) => kegiatanItem(p, 'Proposal', `/proposals?detail=${p.id}`, nama(p))),
      ...daftar(lap).map((l) => kegiatanItem(l, 'Laporan', `/laporan-masuk?id=${l.id}`, nama(l))),
      ...daftar(usr).map((u) => ({
        key: `user-${u.id}`,
        group: 'User',
        to: `/users?id=${u.id}`,
        title: u.fullName || u.name,
        subtitle: u.email,
        badge: u.status,
        badgeClass: { approved: 'badge-success', pending: 'badge-warning', rejected: 'badge-danger' }[u.status],
      })),
    ]
  } else if (ctx.peran === 'mahasiswa') {
    const res = await safe(laporanHarianApi.getMyProposals())
    data = daftar(res)
      .filter((p) => `${p.judul} ${p.pengusul?.name || ''}`.toLowerCase().includes(k))
      .slice(0, 5)
      .map((p) => kegiatanItem(p, 'Project', `/project/${p.jenis}?id=${p.id}`, p.pengusul?.name))
  }
  return [...pages, ...data]
}
