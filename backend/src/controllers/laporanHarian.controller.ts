import { Response } from "express";
import { z } from "zod";

import { laporanHarianService } from "../services/laporanHarian.service";
import { sendSuccess, sendError } from "../utils/response";
import { AuthRequest } from "../types";

const createLaporanHarianSchema = z.object({
  tanggal: z.coerce.date({
    required_error: "Tanggal dan kegiatan wajib diisi",
    invalid_type_error: "Tanggal dan kegiatan wajib diisi",
  }),
  kegiatan: z
    .string({
      required_error: "Tanggal dan kegiatan wajib diisi",
      invalid_type_error: "Tanggal dan kegiatan wajib diisi",
    })
    .trim()
    .min(1, "Tanggal dan kegiatan wajib diisi"),
  linkGdrive: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

type UploadedFile = Express.Multer.File | undefined;

function getAuthenticatedUserId(req: AuthRequest): number {
  return req.user!.userId;
}

function getSingleValue(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  return "";
}

function parseIdParam(value: string | string[] | undefined): number {
  return Number(getSingleValue(value));
}

function getUploadedFile(req: AuthRequest): UploadedFile {
  return (req as AuthRequest & { file?: Express.Multer.File }).file;
}

function buildCreatePayload(body: unknown, file?: Express.Multer.File) {
  const parsed = createLaporanHarianSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false as const,
    };
  }

  const { tanggal, kegiatan, linkGdrive } = parsed.data;

  return {
    ok: true as const,
    data: {
      tanggal,
      kegiatan,
      linkGdrive,
      ...(file
        ? {
            dokumenNama: file.originalname,
            dokumenMime: file.mimetype,
            dokumenUkuran: file.size,
            dokumenBlob: new Uint8Array(file.buffer) as unknown as Uint8Array<ArrayBuffer>,
          }
        : {}),
    },
  };
}

export const laporanHarianController = {
  async getMyProposals(req: AuthRequest, res: Response) {
    const userId = getAuthenticatedUserId(req);
    const result = await laporanHarianService.getMyProposals(userId);

    return sendSuccess(res, "Proposals fetched", result);
  },

  async getByProposal(req: AuthRequest, res: Response) {
    const proposalId = parseIdParam(req.params.proposalId);
    const userId = getAuthenticatedUserId(req);

    const result = await laporanHarianService.getByProposal(proposalId, userId);

    return sendSuccess(res, "Laporan harian fetched", result);
  },

  async create(req: AuthRequest, res: Response) {
    const proposalId = parseIdParam(req.params.proposalId);
    const userId = getAuthenticatedUserId(req);
    const file = getUploadedFile(req);

    const payload = buildCreatePayload(req.body, file);

    if (!payload.ok) {
      return sendError(res, "Tanggal dan kegiatan wajib diisi", 400);
    }

    const result = await laporanHarianService.create(
      proposalId,
      userId,
      payload.data,
    );

    return sendSuccess(res, "Laporan harian berhasil dibuat", result, 201);
  },

  async getDokumen(req: AuthRequest, res: Response) {
    const laporanId = parseIdParam(req.params.id);
    const userId = getAuthenticatedUserId(req);

    const laporan = await laporanHarianService.getDokumen(laporanId, userId);

    // X-Content-Type-Options: nosniff — instruksikan browser untuk PERCAYA
    // Content-Type yang di-set di sini, jangan menebak tipe file dari isi
    // (content-sniffing). Tanpa ini, ada browser yang bisa "menemukan" file
    // sebagai HTML meski Content-Type bilang PDF, kalau isinya ambigu.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      // encodeURIComponent WAJIB di sini — dokumenNama berasal dari nama
      // file asli yang di-upload user (originalname), tidak divalidasi
      // sama sekali sebelumnya. Tanpa encode, karakter seperti " atau
      // newline di nama file bisa dipakai untuk HTTP header injection.
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(laporan.dokumenNama || "laporan-harian")}"`,
    );
    res.setHeader("Content-Type", laporan.dokumenMime!);

    return res.send(laporan.dokumenBlob);
  },

  async delete(req: AuthRequest, res: Response) {
    const laporanId = parseIdParam(req.params.id);
    const userId = getAuthenticatedUserId(req);

    await laporanHarianService.delete(laporanId, userId);

    return sendSuccess(res, "Laporan harian berhasil dihapus");
  },
};
