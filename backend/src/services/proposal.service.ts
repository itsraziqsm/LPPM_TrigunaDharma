import {
  JenisKegiatan,
  ProposalStatus,
  Prisma,
  RoleName,
  NotifType,
} from "@prisma/client";
import { prisma } from "../config/prisma";
import { notificationService } from "./notification.service";
import { activityLogService } from "./activityLog.service";
import { validateFileIsAllowedDocument } from "../utils/fileValidation";
import { ensureProposalAccess } from "./proposalAccess";

const proposalSelect = {
  id: true,
  judul: true,
  abstrak: true,
  jenis: true,
  status: true,
  anggaran: true,
  catatanRevisi: true,
  dokumenUrl: true,
  dokumenNama: true,
  dokumenMime: true,
  dokumenUkuran: true,
  submittedAt: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
  pengusul: {
    select: {
      id: true,
      name: true,
      fullName: true,
      email: true,
      programStudi: true,
      nidn: true,
    },
  },
  periode: {
    select: {
      id: true,
      nama: true,
      tahun: true,
    },
  },
  anggota: {
    select: {
      id: true,
      peran: true,
      user: {
        select: {
          id: true,
          name: true,
          fullName: true,
          email: true,
        },
      },
    },
  },
  reviewerTugasan: {
    select: {
      id: true,
      reviewerId: true,
      reviewer: {
        select: {
          id: true,
          name: true,
          fullName: true,
        },
      },
      createdAt: true,
    },
  },
} satisfies Prisma.ProposalSelect;

type FindAllProposalParams = {
  page: number;
  limit: number;
  jenis?: JenisKegiatan;
  status?: ProposalStatus;
  periodeId?: number;
  pengusulId?: number;
  programStudi?: string;
  tahun?: number;
  search?: string;
};

type FindByPengusulParams = {
  page: number;
  limit: number;
  jenis?: JenisKegiatan;
};

type CreateProposalInput = {
  judul: string;
  abstrak: string;
  jenis: JenisKegiatan;
  anggaran?: number;
  periodeId: number;
  dokumenUrl?: string;
  anggotaIds?: { userId: number; peran: string }[];
  pengusulId: number;
};

type UpdateProposalInput = Partial<{
  judul: string;
  abstrak: string;
  anggaran: number;
  periodeId: number;
  dokumenUrl: string;
  anggotaIds: { userId: number; peran: string }[];
}>;

type UploadProposalDokumenInput = {
  buffer: Uint8Array;
  originalname: string;
  mimetype: string;
  size: number;
};

const NOT_FOUND_MESSAGE = "Proposal tidak ditemukan";
const EDITABLE_STATUSES: ProposalStatus[] = [
  ProposalStatus.draft,
  ProposalStatus.revisi,
];
const SUBMITTABLE_STATUSES: ProposalStatus[] = [
  ProposalStatus.draft,
  ProposalStatus.revisi,
];
const DELETABLE_STATUS = ProposalStatus.draft;

const notificationTypeMap: Partial<Record<ProposalStatus, NotifType>> = {
  [ProposalStatus.disetujui]: "proposal_disetujui" as NotifType,
  [ProposalStatus.ditolak]: "proposal_ditolak" as NotifType,
  [ProposalStatus.revisi]: "proposal_revisi" as NotifType,
  [ProposalStatus.review]: "reviewer_ditugaskan" as NotifType,
};

function buildProposalWhereClause(
  params: FindAllProposalParams,
): Prisma.ProposalWhereInput {
  const { jenis, status, periodeId, pengusulId, programStudi, tahun, search } =
    params;

  const where: Prisma.ProposalWhereInput = {};

  if (jenis) {
    where.jenis = jenis;
  }

  if (status) {
    where.status = status;
  }

  if (periodeId) {
    where.periodeId = periodeId;
  }

  if (pengusulId) {
    where.pengusulId = pengusulId;
  }

  if (programStudi) {
    where.pengusul = {
      programStudi,
    };
  }

  if (tahun) {
    where.periode = {
      tahun,
    };
  }

  if (search) {
    where.OR = [
      {
        judul: {
          contains: search,
        },
      },
      {
        abstrak: {
          contains: search,
        },
      },
    ];
  }

  return where;
}

async function getProposalByIdOrThrow(id: number) {
  const proposal = await prisma.proposal.findUnique({
    where: { id },
  });

  if (!proposal) {
    throw new Error(NOT_FOUND_MESSAGE);
  }

  return proposal;
}

async function getProposalWithPengusulByIdOrThrow(id: number) {
  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: { pengusul: true },
  });

  if (!proposal) {
    throw new Error(NOT_FOUND_MESSAGE);
  }

  return proposal;
}

function validateEditableStatus(status: ProposalStatus) {
  if (!EDITABLE_STATUSES.includes(status)) {
    throw new Error("Proposal hanya bisa diedit saat status draft atau revisi");
  }
}

function validateSubmittableStatus(status: ProposalStatus) {
  if (!SUBMITTABLE_STATUSES.includes(status)) {
    throw new Error(
      "Hanya proposal berstatus draft atau revisi yang bisa diajukan",
    );
  }
}

function validateDeletableStatus(status: ProposalStatus) {
  if (status !== DELETABLE_STATUS) {
    throw new Error("Hanya proposal berstatus draft yang bisa dihapus");
  }
}

async function validatePeriodeForCreate(
  periodeId: number,
  jenis: JenisKegiatan,
) {
  if (!periodeId) {
    throw new Error("Periode harus dipilih");
  }

  const periode = await prisma.periode.findUnique({
    where: { id: periodeId },
  });

  if (!periode) {
    throw new Error("Periode tidak ditemukan");
  }

  if (periode.jenis !== jenis) {
    throw new Error(
      `Jenis proposal (${jenis}) tidak sesuai dengan jenis periode (${periode.jenis})`,
    );
  }

  return periode;
}

function buildProposalCreateData(
  data: CreateProposalInput,
): Prisma.ProposalUncheckedCreateInput {
  const { anggotaIds, ...rest } = data;

  return {
    ...rest,
    status: ProposalStatus.draft,
    ...(anggotaIds && anggotaIds.length > 0
      ? {
          anggota: {
            create: anggotaIds,
          },
        }
      : {}),
  };
}

function buildProposalUpdateData(
  data: UpdateProposalInput,
): Prisma.ProposalUncheckedUpdateInput {
  const { anggotaIds, ...rest } = data;

  return {
    ...rest,
    ...(anggotaIds
      ? {
          anggota: {
            deleteMany: {},
            create: anggotaIds,
          },
        }
      : {}),
  };
}

async function logProposalActivity(params: {
  userId: number;
  action: string;
  entityId: number;
  proposalId?: number;
  detail: string;
}) {
  await activityLogService.log({
    userId: params.userId,
    action: params.action,
    entityType: "proposal",
    entityId: params.entityId,
    proposalId: params.proposalId,
    detail: params.detail,
  });
}

async function sendProposalStatusNotification(params: {
  proposalId: number;
  pengusulId: number;
  judulProposal: string;
  status: ProposalStatus;
  catatanRevisi?: string;
}) {
  const notifType = notificationTypeMap[params.status];

  if (!notifType) {
    return;
  }

  await notificationService.create({
    userId: params.pengusulId,
    type: notifType,
    judul: `Proposal ${params.status}`,
    pesan: `Proposal "${params.judulProposal}" telah ${params.status}${params.catatanRevisi ? ". Catatan: " + params.catatanRevisi : ""}`,
    refId: params.proposalId,
    refType: "proposal",
  });
}

export const proposalService = {
  async findAll(params: FindAllProposalParams) {
    const { page, limit } = params;
    const skip = (page - 1) * limit;
    const where = buildProposalWhereClause(params);

    const [proposals, total] = await Promise.all([
      prisma.proposal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: proposalSelect,
      }),
      prisma.proposal.count({ where }),
    ]);

    return {
      proposals,
      total,
      page,
      limit,
    };
  },

  async findById(id: number, userId: number, userRoles: RoleName[]) {
    // Cek kewenangan SEBELUM query detail — mencegah proposal orang lain
    // terbaca (termasuk daftar anggota, dokumen, laporan, hasil review)
    // oleh dosen/mahasiswa yang tidak terkait. admin/ketua_lppm dan
    // reviewer yang ditugaskan tetap bisa membaca (level "read").
    await ensureProposalAccess(id, userId, userRoles, "read");

    const proposal = await prisma.proposal.findUnique({
      where: { id },
      select: {
        ...proposalSelect,
        reviewerTugasan: {
          select: {
            id: true,
            reviewer: {
              select: {
                id: true,
                name: true,
                fullName: true,
                email: true,
              },
            },
            createdAt: true,
          },
        },
        reviews: {
          select: {
            id: true,
            nilaiRelevansi: true,
            nilaiMetodologi: true,
            nilaiAnggaran: true,
            nilaiLuaran: true,
            catatan: true,
            rekomendasi: true,
            isDone: true,
            reviewer: {
              select: {
                id: true,
                name: true,
              },
            },
            createdAt: true,
          },
        },
        laporan: true,
        dokumenLampiran: true,
      },
    });

    if (!proposal) {
      throw new Error(NOT_FOUND_MESSAGE);
    }

    return proposal;
  },

  async findByPengusul(pengusulId: number, params: FindByPengusulParams) {
    return this.findAll({
      ...params,
      pengusulId,
    });
  },

  async create(data: CreateProposalInput) {
    await validatePeriodeForCreate(data.periodeId, data.jenis);

    const proposal = await prisma.proposal.create({
      data: buildProposalCreateData(data),
      select: proposalSelect,
    });

    await logProposalActivity({
      userId: data.pengusulId,
      action: "proposal.create",
      entityId: proposal.id,
      proposalId: proposal.id,
      detail: `Proposal "${proposal.judul}" dibuat sebagai draft`,
    });

    return proposal;
  },

  async update(
    id: number,
    userId: number,
    userRoles: RoleName[],
    data: UpdateProposalInput,
  ) {
    // Ownership check dulu, baru validasi status — supaya user yang
    // memang bukan pemilik tidak bisa membedakan "proposal ini bukan
    // milikmu" dari "proposal ini sedang tidak bisa diedit" lewat pesan
    // error (keduanya tetap 403/400 terpisah, tapi urutan cek ini
    // mencegah percobaan enumerasi status proposal orang lain).
    await ensureProposalAccess(id, userId, userRoles, "write");

    const existingProposal = await getProposalByIdOrThrow(id);
    validateEditableStatus(existingProposal.status);

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: buildProposalUpdateData(data),
      select: proposalSelect,
    });

    await logProposalActivity({
      userId,
      action: "proposal.update",
      entityId: id,
      proposalId: id,
      detail: `Proposal "${updatedProposal.judul}" diperbarui`,
    });

    return updatedProposal;
  },

  async submit(id: number, userId: number, userRoles: RoleName[]) {
    await ensureProposalAccess(id, userId, userRoles, "write");

    const existingProposal = await getProposalByIdOrThrow(id);
    validateSubmittableStatus(existingProposal.status);

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: {
        status: ProposalStatus.diajukan,
        submittedAt: new Date(),
      },
      select: proposalSelect,
    });

    await logProposalActivity({
      userId,
      action: "proposal.submit",
      entityId: id,
      proposalId: id,
      detail: `Proposal "${updatedProposal.judul}" diajukan`,
    });

    return updatedProposal;
  },

  async updateStatus(
    id: number,
    ketua_userId: number,
    status: ProposalStatus,
    catatanRevisi?: string,
  ) {
    const existingProposal = await getProposalWithPengusulByIdOrThrow(id);

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: {
        status,
        ...(catatanRevisi !== undefined && { catatanRevisi }),
        ...(status === ProposalStatus.disetujui && {
          approvedAt: new Date(),
        }),
        ...(status === ProposalStatus.review && {
          catatanRevisi: null,
        }),
      },
      select: proposalSelect,
    });

    await sendProposalStatusNotification({
      proposalId: id,
      pengusulId: existingProposal.pengusulId,
      judulProposal: existingProposal.judul,
      status,
      catatanRevisi,
    });

    await logProposalActivity({
      userId: ketua_userId,
      action: `proposal.status.${status}`,
      entityId: id,
      proposalId: id,
      detail: `Status proposal "${updatedProposal.judul}" diubah menjadi ${status}`,
    });

    return updatedProposal;
  },

  async delete(id: number, userId: number, userRoles: RoleName[]) {
    await ensureProposalAccess(id, userId, userRoles, "write");

    const existingProposal = await getProposalByIdOrThrow(id);
    validateDeletableStatus(existingProposal.status);

    await prisma.proposal.delete({
      where: { id },
    });

    await logProposalActivity({
      userId,
      action: "proposal.delete",
      entityId: id,
      detail: `Proposal "${existingProposal.judul}" dihapus`,
    });
  },

  async saveDokumen(
    proposalId: number,
    userId: number,
    userRoles: RoleName[],
    file: UploadProposalDokumenInput,
  ) {
    await ensureProposalAccess(proposalId, userId, userRoles, "write");

    const proposal = await getProposalByIdOrThrow(proposalId);

    // Deteksi tipe file dari isi asli (magic bytes), bukan percaya
    // file.mimetype yang cuma klaim header dari client. Melempar
    // InvalidFileTypeError kalau bukan PDF/DOCX asli — ditangani oleh
    // error middleware global (lihat error.middleware.ts).
    const verifiedMimeType = await validateFileIsAllowedDocument(Buffer.from(file.buffer));

    const updatedDokumen = await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        dokumenBlob: new Uint8Array(file.buffer) as unknown as Uint8Array<ArrayBuffer>,
        dokumenNama: file.originalname,
        dokumenMime: verifiedMimeType,
        dokumenUkuran: file.size,
        dokumenUrl: null,
      },
      select: {
        id: true,
        dokumenNama: true,
        dokumenMime: true,
        dokumenUkuran: true,
      },
    });

    await logProposalActivity({
      userId,
      action: "proposal.dokumen.upload",
      entityId: proposalId,
      proposalId,
      detail: `Dokumen "${file.originalname}" diunggah untuk proposal "${proposal.judul}"`,
    });

    return updatedDokumen;
  },

  async getDokumen(proposalId: number, userId: number, userRoles: RoleName[]) {
    // Ini fungsi yang tadinya jadi celah IDOR utama: siapa pun yang login
    // (role dosen/mahasiswa apa saja) bisa download dokumen proposal
    // siapa pun hanya dengan menebak proposalId di URL. Sekarang dicek
    // dulu apakah user berwenang (pengusul/anggota diterima/reviewer
    // ditugaskan/admin/ketua_lppm) sebelum blob file diambil dari DB.
    await ensureProposalAccess(proposalId, userId, userRoles, "read");

    return prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        dokumenBlob: true,
        dokumenNama: true,
        dokumenMime: true,
        dokumenUkuran: true,
      },
    });
  },
};
