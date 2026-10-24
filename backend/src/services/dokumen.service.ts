import { z } from "zod";
import { RoleName } from "@prisma/client";
import { prisma } from "../config/prisma";
import { activityLogService } from "./activityLog.service";
import { validateFileIsAllowedDocument } from "../utils/fileValidation";
import { ensureProposalAccess } from "./proposalAccess";

type CreateDokumenInput = {
  namaFile: string;
  fileUrl?: string;
  ukuran?: number;
  file?: Express.Multer.File;
};

const createDokumenSchema = z
  .object({
    namaFile: z.string().min(1, "Nama file wajib diisi."),
    fileUrl: z.string().min(1).optional(),
    ukuran: z.number().int().nonnegative().optional(),
    file: z
      .object({
        buffer: z.instanceof(Buffer),
        size: z.number().int().nonnegative(),
        mimetype: z.string().min(1),
        originalname: z.string().min(1),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.file && !data.fileUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "File atau URL dokumen wajib diisi.",
        path: ["file"],
      });
    }
  });

const dokumenListSelect = {
  id: true,
  proposalId: true,
  namaFile: true,
  fileUrl: true,
  ukuran: true,
  fileMime: true,
  fileNama: true,
  createdAt: true,
} as const;

const dokumenCreateResponseSelect = {
  id: true,
  proposalId: true,
  namaFile: true,
  fileUrl: true,
  ukuran: true,
  fileMime: true,
  fileNama: true,
  createdAt: true,
} as const;

async function ensureProposalExists(proposalId: number): Promise<void> {
  await prisma.proposal.findUniqueOrThrow({
    where: { id: proposalId },
    select: { id: true },
  });
}

function validateCreateInput(data: CreateDokumenInput) {
  return createDokumenSchema.parse(data);
}

async function buildCreatePayload(
  proposalId: number,
  data: ReturnType<typeof validateCreateInput>,
) {
  const uploadedFile = data.file;

  // Deteksi tipe file dari isi asli (magic bytes), bukan percaya
  // uploadedFile.mimetype yang cuma klaim header dari client.
  const verifiedMimeType = uploadedFile
    ? await validateFileIsAllowedDocument(uploadedFile.buffer)
    : null;

  return {
    proposalId,
    namaFile: data.namaFile,
    fileUrl: uploadedFile ? null : data.fileUrl,
    ukuran: uploadedFile ? uploadedFile.size : data.ukuran,
    fileBlob: uploadedFile ? new Uint8Array(uploadedFile.buffer) : null,
    fileMime: verifiedMimeType,
    fileNama: uploadedFile ? uploadedFile.originalname : null,
  };
}

async function logDokumenUploaded(params: {
  userId: number;
  proposalId: number;
  namaFile: string;
}) {
  await activityLogService.log({
    userId: params.userId,
    action: "dokumen.upload",
    entityType: "proposal",
    entityId: params.proposalId,
    proposalId: params.proposalId,
    detail: `Dokumen "${params.namaFile}" diunggah`,
  });
}

async function logDokumenDeleted(params: {
  userId: number;
  proposalId: number;
  namaFile: string;
}) {
  await activityLogService.log({
    userId: params.userId,
    action: "dokumen.delete",
    entityType: "proposal",
    entityId: params.proposalId,
    proposalId: params.proposalId,
    detail: `Dokumen "${params.namaFile}" dihapus`,
  });
}

export const dokumenService = {
  async findByProposal(
    proposalId: number,
    userId: number,
    userRoles: RoleName[],
  ) {
    await ensureProposalExists(proposalId);
    await ensureProposalAccess(proposalId, userId, userRoles, "read");

    return prisma.dokumenLampiran.findMany({
      where: { proposalId },
      orderBy: { createdAt: "desc" },
      select: dokumenListSelect,
    });
  },

  // DokumenLampiran tidak punya kolom userId langsung — kepemilikannya
  // transitif lewat proposalId, jadi kita ambil proposalId-nya dulu baru
  // cek akses ke proposal induknya. Ini sebelumnya jadi celah IDOR:
  // dokumen lampiran proposal siapa pun bisa didownload user login mana
  // pun hanya dengan menebak id dokumen.
  async findById(id: number, userId: number, userRoles: RoleName[]) {
    const dokumen = await prisma.dokumenLampiran.findUniqueOrThrow({
      where: { id },
    });

    await ensureProposalAccess(
      dokumen.proposalId,
      userId,
      userRoles,
      "read",
    );

    return dokumen;
  },

  async create(
    proposalId: number,
    userId: number,
    userRoles: RoleName[],
    data: CreateDokumenInput,
  ) {
    await ensureProposalExists(proposalId);
    await ensureProposalAccess(proposalId, userId, userRoles, "write");

    const validatedData = validateCreateInput(data);
    const createPayload = await buildCreatePayload(proposalId, validatedData);

    const createdDokumen = await prisma.dokumenLampiran.create({
      data: createPayload,
      select: dokumenCreateResponseSelect,
    });

    await logDokumenUploaded({
      userId,
      proposalId,
      namaFile: validatedData.namaFile,
    });

    return createdDokumen;
  },

  async delete(id: number, userId: number, userRoles: RoleName[]) {
    const existingDokumen = await prisma.dokumenLampiran.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        proposalId: true,
        namaFile: true,
      },
    });

    await ensureProposalAccess(
      existingDokumen.proposalId,
      userId,
      userRoles,
      "write",
    );

    await prisma.dokumenLampiran.delete({
      where: { id },
    });

    await logDokumenDeleted({
      userId,
      proposalId: existingDokumen.proposalId,
      namaFile: existingDokumen.namaFile,
    });
  },
};
