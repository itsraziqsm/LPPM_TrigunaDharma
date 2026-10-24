import { RoleName } from "@prisma/client";
import { prisma } from "../config/prisma";
import { notificationService } from "./notification.service";
import { activityLogService } from "./activityLog.service";
import { validateFileIsAllowedDocument } from "../utils/fileValidation";
import { ensureProposalAccess } from "./proposalAccess";

type CreateLaporanInput = {
  jenis: string;
  judul: string;
  dokumenUrl?: string;
  keterangan?: string;
  file?: Express.Multer.File;
};

type UpdateLaporanInput = Partial<{
  jenis: string;
  judul: string;
  dokumenUrl: string;
  keterangan: string;
}>;

const laporanListSelect = {
  id: true,
  proposalId: true,
  jenis: true,
  judul: true,
  dokumenUrl: true,
  dokumenNama: true,
  dokumenMime: true,
  dokumenUkuran: true,
  keterangan: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function ensureProposalExists(proposalId: number) {
  return prisma.proposal.findUniqueOrThrow({
    where: { id: proposalId },
  });
}

async function ensureLaporanExists(id: number) {
  return prisma.laporanProposal.findUniqueOrThrow({
    where: { id },
  });
}

function ensureProposalApprovedForLaporan(status: string) {
  if (!["disetujui"].includes(status)) {
    throw new Error(
      "Laporan hanya bisa diunggah untuk proposal yang sudah disetujui",
    );
  }
}

function ensureDokumenSourceExists(data: CreateLaporanInput) {
  if (!data.file && !data.dokumenUrl) {
    throw new Error("File atau URL dokumen wajib diisi.");
  }
}

async function buildCreateLaporanData(
  proposalId: number,
  data: CreateLaporanInput,
) {
  const hasUploadedFile = Boolean(data.file);

  // Deteksi tipe file dari isi asli (magic bytes), bukan percaya
  // data.file.mimetype yang cuma klaim header dari client.
  const verifiedMimeType = hasUploadedFile
    ? await validateFileIsAllowedDocument(data.file!.buffer)
    : null;

  return {
    proposalId,
    jenis: data.jenis,
    judul: data.judul,
    keterangan: data.keterangan,
    dokumenUrl: hasUploadedFile ? null : data.dokumenUrl,
    dokumenBlob: hasUploadedFile ? new Uint8Array(data.file!.buffer) : null,
    dokumenNama: hasUploadedFile ? data.file!.originalname : null,
    dokumenMime: verifiedMimeType,
    dokumenUkuran: hasUploadedFile ? data.file!.size : null,
  };
}

function omitDokumenBlob<T extends { dokumenBlob?: unknown }>(laporan: T) {
  const { dokumenBlob, ...result } = laporan;
  return result;
}

async function createLaporanUploadedNotification(params: {
  userId: number;
  proposalId: number;
  proposalTitle: string;
  jenis: string;
}) {
  const { userId, proposalId, proposalTitle, jenis } = params;

  await notificationService.create({
    userId,
    type: "laporan_diunggah",
    judul: "Laporan Diunggah",
    pesan: `Laporan ${jenis} untuk "${proposalTitle}" telah diunggah`,
    refId: proposalId,
    refType: "proposal",
  });
}

async function logLaporanUploadActivity(params: {
  userId: number;
  proposalId: number;
  jenis: string;
}) {
  const { userId, proposalId, jenis } = params;

  await activityLogService.log({
    userId,
    action: "laporan.upload",
    entityType: "proposal",
    entityId: proposalId,
    proposalId,
    detail: `Laporan ${jenis} diunggah`,
  });
}

async function logLaporanDeleteActivity(params: {
  userId: number;
  proposalId: number;
}) {
  const { userId, proposalId } = params;

  await activityLogService.log({
    userId,
    action: "laporan.delete",
    entityType: "proposal",
    entityId: proposalId,
    proposalId,
  });
}

export const laporanService = {
  async findByProposal(
    proposalId: number,
    userId: number,
    userRoles: RoleName[],
  ) {
    await ensureProposalExists(proposalId);
    await ensureProposalAccess(proposalId, userId, userRoles, "read");

    // Exclude blob dari list — hanya ambil metadata
    return prisma.laporanProposal.findMany({
      where: { proposalId },
      orderBy: { createdAt: "desc" },
      select: laporanListSelect,
    });
  },

  // LaporanProposal (sama seperti DokumenLampiran) tidak punya kolom
  // userId langsung — kepemilikannya transitif lewat proposalId.
  async findById(id: number, userId: number, userRoles: RoleName[]) {
    const laporan = await ensureLaporanExists(id);

    await ensureProposalAccess(
      laporan.proposalId,
      userId,
      userRoles,
      "read",
    );

    return laporan;
  },

  async create(
    proposalId: number,
    userId: number,
    userRoles: RoleName[],
    data: CreateLaporanInput,
  ) {
    const proposal = await ensureProposalExists(proposalId);

    await ensureProposalAccess(proposalId, userId, userRoles, "write");
    ensureProposalApprovedForLaporan(proposal.status);
    ensureDokumenSourceExists(data);

    const laporan = await prisma.laporanProposal.create({
      data: await buildCreateLaporanData(proposalId, data),
    });

    await createLaporanUploadedNotification({
      userId: proposal.pengusulId,
      proposalId,
      proposalTitle: proposal.judul,
      jenis: data.jenis,
    });

    await logLaporanUploadActivity({
      userId,
      proposalId,
      jenis: data.jenis,
    });

    // Return tanpa blob
    return omitDokumenBlob(laporan);
  },

  async update(
    id: number,
    userId: number,
    userRoles: RoleName[],
    data: UpdateLaporanInput,
  ) {
    const laporan = await ensureLaporanExists(id);

    await ensureProposalAccess(
      laporan.proposalId,
      userId,
      userRoles,
      "write",
    );

    return prisma.laporanProposal.update({
      where: { id },
      data,
    });
  },

  async delete(id: number, userId: number, userRoles: RoleName[]) {
    const laporan = await ensureLaporanExists(id);

    await ensureProposalAccess(
      laporan.proposalId,
      userId,
      userRoles,
      "write",
    );

    await prisma.laporanProposal.delete({
      where: { id },
    });

    await logLaporanDeleteActivity({
      userId,
      proposalId: laporan.proposalId,
    });
  },
};
