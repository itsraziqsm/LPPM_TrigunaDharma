import { JenisKegiatan, ProposalStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

export type ExportFilter = {
  periodeId?: number;
  jenis?: JenisKegiatan;
  status?: ProposalStatus;
  tahun?: number;
  programStudi?: string;
};

const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  diajukan: "Diajukan",
  review: "Sedang Direview",
  revisi: "Revisi",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
};

const JENIS_LABEL: Record<JenisKegiatan, string> = {
  penelitian: "Penelitian",
  pengabdian: "Pengabdian",
};

function buildWhere(filter: ExportFilter): Prisma.ProposalWhereInput {
  const where: Prisma.ProposalWhereInput = {};

  if (filter.jenis) where.jenis = filter.jenis;
  if (filter.status) where.status = filter.status;
  if (filter.periodeId) where.periodeId = filter.periodeId;
  if (filter.programStudi) where.pengusul = { programStudi: filter.programStudi };
  if (filter.tahun) where.periode = { tahun: filter.tahun };

  return where;
}

export const exportService = {
  async getExportData(filter: ExportFilter) {
    const where = buildWhere(filter);

    const proposals = await prisma.proposal.findMany({
      where,
      orderBy: [{ periode: { tahun: "desc" } }, { createdAt: "desc" }],
      select: {
        id: true,
        judul: true,
        jenis: true,
        status: true,
        anggaran: true,
        submittedAt: true,
        approvedAt: true,
        createdAt: true,
        catatanRevisi: true,
        pengusul: {
          select: {
            name: true,
            fullName: true,
            email: true,
            nidn: true,
            programStudi: true,
          },
        },
        periode: {
          select: { id: true, nama: true, tahun: true, jenis: true },
        },
        anggota: {
          select: {
            peran: true,
            user: { select: { name: true, fullName: true } },
          },
        },
        reviewerTugasan: {
          select: {
            reviewer: { select: { name: true, fullName: true } },
          },
        },
        reviews: {
          select: {
            nilaiRelevansi: true,
            nilaiMetodologi: true,
            nilaiAnggaran: true,
            nilaiLuaran: true,
            catatan: true,
            rekomendasi: true,
            isDone: true,
            reviewer: { select: { name: true } },
          },
        },
      },
    });

    // Hitung ringkasan
    const perStatus = proposals.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});

    const perJenis = proposals.reduce<Record<string, number>>((acc, p) => {
      acc[p.jenis] = (acc[p.jenis] || 0) + 1;
      return acc;
    }, {});

    const perProdi = proposals.reduce<Record<string, number>>((acc, p) => {
      const prodi = p.pengusul.programStudi || "Tidak Diketahui";
      acc[prodi] = (acc[prodi] || 0) + 1;
      return acc;
    }, {});

    // Format baris tabel
    const rows = proposals.map((p, i) => ({
      no: i + 1,
      id: p.id,
      judul: p.judul,
      jenis: JENIS_LABEL[p.jenis],
      status: STATUS_LABEL[p.status],
      pengusul: p.pengusul.fullName || p.pengusul.name,
      nidn: p.pengusul.nidn || "-",
      programStudi: p.pengusul.programStudi || "-",
      periode: p.periode ? `${p.periode.nama} (${p.periode.tahun})` : "-",
      anggaran: p.anggaran ? Number(p.anggaran).toLocaleString("id-ID") : "-",
      anggota: p.anggota
        .map((a) => `${a.user.fullName || a.user.name} (${a.peran})`)
        .join("; ") || "-",
      reviewer: p.reviewerTugasan
        .map((r) => r.reviewer.fullName || r.reviewer.name)
        .join("; ") || "-",
      jumlahReview: p.reviews.length,
      reviewSelesai: p.reviews.filter((r) => r.isDone).length,
      catatanRevisi: p.catatanRevisi || "-",
      submittedAt: p.submittedAt
        ? new Date(p.submittedAt).toLocaleDateString("id-ID")
        : "-",
      approvedAt: p.approvedAt
        ? new Date(p.approvedAt).toLocaleDateString("id-ID")
        : "-",
      createdAt: new Date(p.createdAt).toLocaleDateString("id-ID"),
    }));

    return {
      total: proposals.length,
      ringkasan: {
        perStatus: Object.entries(perStatus).map(([status, count]) => ({
          label: STATUS_LABEL[status as ProposalStatus] || status,
          count,
        })),
        perJenis: Object.entries(perJenis).map(([jenis, count]) => ({
          label: JENIS_LABEL[jenis as JenisKegiatan] || jenis,
          count,
        })),
        perProdi: Object.entries(perProdi)
          .sort((a, b) => b[1] - a[1])
          .map(([programStudi, count]) => ({ programStudi, count })),
      },
      rows,
      generatedAt: new Date().toISOString(),
    };
  },
};
