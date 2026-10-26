import Breadcrumb from '../../components/Breadcrumb'
import useJejakMenu from '../../hooks/useJejakMenu'

// Breadcrumb halaman di menu Cetak Dokumen (Admin: di bawah Dokumentasi).
export default function CetakBreadcrumb({ last }) {
  const induk = useJejakMenu('dokumentasi')
  return <Breadcrumb items={[...induk, last ? { label: 'Cetak Dokumen', to: '/cetak-dokumen' } : { label: 'Cetak Dokumen' }, ...(last ? [{ label: last }] : [])]} />
}
