import { JenisKegiatan, Prisma, ProposalStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { activityLogService } from "./activityLog.service";

const proposalDosenSelect = {
  id: true,
  judul: true,
  abstrak: true,
  jenis: true,
  status: true,
  anggaran: true,
  catatanRevisi: true,
  dokumenUrl: true,
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
      nidn: true,
      programStudi: true,
    },
  },
  periode: {
    select: {
      id: true,
      nama: true,
      tahun: true,
      jenis: true,
    },
  },
  anggota: {
    select: {
      id: true,
      peran: true,
      statusUndangan: true,
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

const proposalDosenDetailSelect = {
  ...proposalDosenSelect,
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
          fullName: true,
        },
      },
      createdAt: true,
    },
  },
  laporan: true,
  dokumenLampiran: true,
} satisfies Prisma.ProposalSelect;

type FindMyProposalsParams = {
  page: number;
  limit: number;
  jenis?: JenisKegiatan;
  status?: ProposalStatus;
  search?: string;
};

type ProposalAnggotaPayload = {
  userId: number;
  peran: string;
};

type CreateProposalPayload = {
  judul: string;
  abstrak: string;
  jenis: JenisKegiatan;
  anggaran?: number;
  periodeId?: number;
  dokumenUrl?: string;
  anggotaIds?: ProposalAnggotaPayload[];
  pengusulId: number;
};

type UpdateProposalPayload = Partial<{
  judul: string;
  abstrak: string;
  anggaran: number;
  periodeId: number;
  dokumenUrl: string;
  anggotaIds: ProposalAnggotaPayload[];
}>;

type InvitationResponseStatus = "diterima" | "ditolak";

const EDITABLE_PROPOSAL_STATUSES: ProposalStatus[] = [
  ProposalStatus.draft,
  ProposalStatus.revisi,
];

const SUBMITTABLE_PROPOSAL_STATUSES: ProposalStatus[] = [
  ProposalStatus.draft,
  ProposalStatus.revisi,
];

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function buildProposalListWhere(
  pengusulId: number,
  params: FindMyProposalsParams,
): Prisma.ProposalWhereInput {
  const { jenis, status, search } = params;
  const normalizedSearch = search?.trim();

  const where: Prisma.ProposalWhereInput = {
    pengusulId,
    ...(jenis ? { jenis } : {}),
    ...(status ? { status } : {}),
  };

  if (normalizedSearch) {
    where.OR = [
      { judul: { contains: normalizedSearch } },
      { abstrak: { contains: normalizedSearch } },
    ];
  }

  return where;
}

function buildAnggotaCreateData(
  anggotaIds?: ProposalAnggotaPayload[],
): Prisma.ProposalAnggotaCreateWithoutProposalInput[] {
  if (!anggotaIds || anggotaIds.length === 0) {
    return [];
  }

  return anggotaIds.map((anggota) => ({
    peran: anggota.peran,
    statusUndangan: "pending",
    user: {
      connect: {
        id: anggota.userId,
      },
    },
  }));
}

async function findProposalOrThrow(id: number) {
  return prisma.proposal.findUniqueOrThrow({
    where: { id },
  });
}

function ensureProposalOwner(pengusulId: number, proposalPengusulId: number) {
  assertCondition(
    proposalPengusulId === pengusulId,
    "Anda tidak memiliki akses ke proposal ini",
  );
}

function ensureProposalEditable(status: ProposalStatus) {
  assertCondition(
    EDITABLE_PROPOSAL_STATUSES.includes(status),
    "Proposal hanya bisa diedit saat status draft atau revisi",
  );
}

function ensureProposalSubmittable(status: ProposalStatus) {
  assertCondition(
    SUBMITTABLE_PROPOSAL_STATUSES.includes(status),
    "Hanya proposal berstatus draft atau revisi yang bisa diajukan",
  );
}

function ensureProposalDeletable(status: ProposalStatus) {
  assertCondition(
    status === ProposalStatus.draft,
    "Hanya proposal berstatus draft yang bisa dihapus",
  );
}

function buildPendingInvitationErrorMessage(
  anggotaBelumSetuju: { statusUndangan: string }[],
) {
  const pendingCount = anggotaBelumSetuju.filter(
    (anggota) => anggota.statusUndangan === "pending",
  ).length;

  const rejectedCount = anggotaBelumSetuju.filter(
    (anggota) => anggota.statusUndangan === "ditolak",
  ).length;

  const messages: string[] = [];

  if (pendingCount > 0) {
    messages.push(`${pendingCount} anggota belum merespons undangan`);
  }

  if (rejectedCount > 0) {
    messages.push(`${rejectedCount} anggota menolak undangan`);
  }

  return `Proposal tidak dapat diajukan: ${messages.join(", ")}. Semua anggota harus menyetujui undangan terlebih dahulu.`;
}

async function ensureAllAnggotaApprovedBeforeSubmit(proposalId: number) {
  const anggotaBelumSetuju = await prisma.proposalAnggota.findMany({
    where: {
      proposalId,
      statusUndangan: { in: ["pending", "ditolak"] },
    },
    select: {
      statusUndangan: true,
    },
  });

  if (anggotaBelumSetuju.length === 0) {
    return;
  }

  throw new Error(buildPendingInvitationErrorMessage(anggotaBelumSetuju));
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

async function getProposalDetailOrThrow(id: number) {
  const proposal = await prisma.proposal.findUnique({
    where: { id },
    select: proposalDosenDetailSelect,
  });

  if (!proposal) {
    throw new Error("Proposal tidak ditemukan");
  }

  return proposal;
}

export const proposalDosenService = {
  async findMyProposals(pengusulId: number, params: FindMyProposalsParams) {
    const { page, limit } = params;
    const skip = (page - 1) * limit;
    const where = buildProposalListWhere(pengusulId, params);

    const [proposals, total] = await Promise.all([
      prisma.proposal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: proposalDosenSelect,
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

  async findMyProposalById(id: number, pengusulId: number) {
    const proposal = await getProposalDetailOrThrow(id);

    ensureProposalOwner(pengusulId, proposal.pengusul.id);

    return proposal;
  },

  async searchUsers(query: string, currentUserId: number) {
    const normalizedQuery = query?.trim();

    if (!normalizedQuery || normalizedQuery.length < 2) {
      return [];
    }

    return prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        status: "approved",
        OR: [
          { name: { contains: normalizedQuery } },
          { fullName: { contains: normalizedQuery } },
          { email: { contains: normalizedQuery } },
          { nidn: { contains: normalizedQuery } },
          { nim: { contains: normalizedQuery } },
        ],
        roles: {
          some: {
            role: {
              name: {
                in: ["dosen", "mahasiswa"],
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        fullName: true,
        email: true,
        nidn: true,
        nim: true,
        programStudi: true,
        prodi: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      take: 10,
    });
  },

  async create(data: CreateProposalPayload) {
    const { anggotaIds, ...proposalData } = data;
    const anggotaCreateData = buildAnggotaCreateData(anggotaIds);

    const proposal = await prisma.proposal.create({
      data: {
        ...proposalData,
        status: ProposalStatus.draft,
        ...(anggotaCreateData.length > 0
          ? {
              anggota: {
                create: anggotaCreateData,
              },
            }
          : {}),
      },
      select: proposalDosenSelect,
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

  async update(id: number, pengusulId: number, data: UpdateProposalPayload) {
    const proposal = await findProposalOrThrow(id);

    ensureProposalOwner(pengusulId, proposal.pengusulId);
    ensureProposalEditable(proposal.status);

    const { anggotaIds, ...proposalData } = data;
    const anggotaCreateData = buildAnggotaCreateData(anggotaIds);

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: {
        ...proposalData,
        ...(anggotaIds
          ? {
              anggota: {
                deleteMany: {},
                create: anggotaCreateData,
              },
            }
          : {}),
      },
      select: proposalDosenSelect,
    });

    await logProposalActivity({
      userId: pengusulId,
      action: "proposal.update",
      entityId: id,
      proposalId: id,
      detail: `Proposal "${updatedProposal.judul}" diperbarui`,
    });

    return updatedProposal;
  },

  async submit(id: number, pengusulId: number) {
    const proposal = await findProposalOrThrow(id);

    ensureProposalOwner(pengusulId, proposal.pengusulId);
    ensureProposalSubmittable(proposal.status);

    await ensureAllAnggotaApprovedBeforeSubmit(id);

    const updatedProposal = await prisma.proposal.update({
      where: { id },
      data: {
        status: ProposalStatus.diajukan,
        submittedAt: new Date(),
      },
      select: proposalDosenSelect,
    });

    await logProposalActivity({
      userId: pengusulId,
      action: "proposal.submit",
      entityId: id,
      proposalId: id,
      detail: `Proposal "${updatedProposal.judul}" diajukan`,
    });

    return updatedProposal;
  },

  async delete(id: number, pengusulId: number) {
    const proposal = await findProposalOrThrow(id);

    ensureProposalOwner(pengusulId, proposal.pengusulId);
    ensureProposalDeletable(proposal.status);

    await prisma.proposal.delete({
      where: { id },
    });

    await logProposalActivity({
      userId: pengusulId,
      action: "proposal.delete",
      entityId: id,
      detail: `Proposal "${proposal.judul}" dihapus`,
    });
  },

  async getStats(pengusulId: number) {
    const [total, draft, diajukan, disetujui, revisi, ditolak] =
      await Promise.all([
        prisma.proposal.count({ where: { pengusulId } }),
        prisma.proposal.count({
          where: { pengusulId, status: ProposalStatus.draft },
        }),
        prisma.proposal.count({
          where: { pengusulId, status: ProposalStatus.diajukan },
        }),
        prisma.proposal.count({
          where: { pengusulId, status: ProposalStatus.disetujui },
        }),
        prisma.proposal.count({
          where: { pengusulId, status: ProposalStatus.revisi },
        }),
        prisma.proposal.count({
          where: { pengusulId, status: ProposalStatus.ditolak },
        }),
      ]);

    return {
      total,
      draft,
      diajukan,
      disetujui,
      revisi,
      ditolak,
    };
  },

  async getMyInvitations(userId: number) {
    return prisma.proposalAnggota.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        peran: true,
        statusUndangan: true,
        createdAt: true,
        proposal: {
          select: {
            id: true,
            judul: true,
            jenis: true,
            status: true,
            anggaran: true,
            pengusul: {
              select: {
                id: true,
                name: true,
                fullName: true,
                email: true,
              },
            },
            periode: {
              select: {
                id: true,
                nama: true,
                tahun: true,
              },
            },
          },
        },
      },
    });
  },

  async respondInvitation(
    anggotaId: number,
    userId: number,
    status: InvitationResponseStatus,
  ) {
    const anggota = await prisma.proposalAnggota.findUnique({
      where: { id: anggotaId },
      include: {
        proposal: true,
      },
    });

    if (!anggota) {
      throw new Error("Undangan tidak ditemukan");
    }

    assertCondition(
      anggota.userId === userId,
      "Anda tidak memiliki akses ke undangan ini",
    );

    assertCondition(
      anggota.statusUndangan === "pending",
      "Undangan sudah direspon sebelumnya",
    );

    const updatedInvitation = await prisma.proposalAnggota.update({
      where: { id: anggotaId },
      data: { statusUndangan: status },
      select: {
        id: true,
        peran: true,
        statusUndangan: true,
        proposal: {
          select: {
            id: true,
            judul: true,
          },
        },
      },
    });

    await logProposalActivity({
      userId,
      action: `proposal.anggota.${status}`,
      entityId: anggota.proposalId,
      proposalId: anggota.proposalId,
      detail: `Undangan anggota proposal "${anggota.proposal.judul}" ${status}`,
    });

    return updatedInvitation;
  },
};
