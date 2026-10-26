import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../api/axios'
import { templateProposalApi } from '../api/templateProposal'

// Tautan "Unduh template proposal" di wizard Usulan (W-36). Template aktif dari server
// (GET /template-proposal/aktif?jenis=, publik; jatuh ke template umum di backend);
// bila admin belum mengunggah apa pun (data null) atau gagal → file statis lama.
const STATIS = '/templates/template-proposal.docx'

export default function TemplateProposalLink({ jenis }) {
  const [tpl, setTpl] = useState(undefined) // undefined = memuat, null = pakai statis

  useEffect(() => {
    let alive = true
    templateProposalApi
      .aktif(jenis)
      .then((r) => alive && setTpl(r.data.data || null))
      .catch(() => alive && setTpl(null))
    return () => {
      alive = false
    }
  }, [jenis])

  const href = tpl ? `${API_BASE_URL}${tpl.unduhUrl}` : STATIS
  const info = tpl ? [tpl.keterangan || tpl.namaFile, tpl.tahun].filter(Boolean).join(' · ') : null

  return (
    <>
      <a
        href={href}
        download={tpl ? tpl.namaFile : 'Template_Proposal.docx'}
        className="font-semibold text-navy-700 hover:text-navy-900"
        aria-disabled={tpl === undefined ? 'true' : undefined}
      >
        Unduh template proposal
      </a>
      {info ? <span className="text-slate-400"> ({info})</span> : null}
    </>
  )
}
