import { Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { proposalService } from "../services/proposal.service";
import { sendSuccess } from "../utils/response";
import { AuthRequest } from "../types";
import { JenisKegiatan, ProposalStatus } from "@prisma/client";

class HttpError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

const asyncHandler = (
  handler: (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req as AuthRequest, res, next)).catch(next);
  };
};

const proposalDocumentSchema = z.object({
  originalname: z.string().min(1),
  mimetype: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  size: z.number().max(10 * 1024 * 1024),
  buffer: z.instanceof(Buffer),
});

const jenisKegiatanValues = Object.values(JenisKegiatan) as JenisKegiatan[];
const proposalStatusValues = Object.values(ProposalStatus) as ProposalStatus[];

function getSingleString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

function parseNumber(value: unknown, fallback?: number): number | undefined {
  const singleValue = getSingleString(value);

  if (singleValue === undefined || singleValue === "") {
    return fallback;
  }

  const parsed = Number(singleValue);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseOptionalNumber(value: unknown): number | undefined {
  const singleValue = getSingleString(value);

  if (singleValue === undefined || singleValue === "") {
    return undefined;
  }

  const parsed = Number(singleValue);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseOptionalString(value: unknown): string | undefined {
  const singleValue = getSingleString(value);

  if (singleValue === undefined) {
    return undefined;
  }

  const trimmed = singleValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isJenisKegiatan(value: string): value is JenisKegiatan {
  return jenisKegiatanValues.includes(value as JenisKegiatan);
}

function isProposalStatus(value: string): value is ProposalStatus {
  return proposalStatusValues.includes(value as ProposalStatus);
}

function parseOptionalJenisKegiatan(value: unknown): JenisKegiatan | undefined {
  const singleValue = parseOptionalString(value);

  if (!singleValue) {
    return undefined;
  }

  if (!isJenisKegiatan(singleValue)) {
    return undefined;
  }

  return singleValue;
}

function parseOptionalProposalStatus(
  value: unknown,
): ProposalStatus | undefined {
  const singleValue = parseOptionalString(value);

  if (!singleValue) {
    return undefined;
  }

  if (!isProposalStatus(singleValue)) {
    return undefined;
  }

  return singleValue;
}

function parseProposalId(idParam: string | string[]): number {
  const rawId = Array.isArray(idParam) ? idParam[0] : idParam;
  return Number(rawId);
}

function parseProposalListQuery(query: Record<string, unknown>) {
  return {
    page: parseNumber(query.page, 1) ?? 1,
    limit: parseNumber(query.limit, 10) ?? 10,
    jenis: parseOptionalJenisKegiatan(query.jenis),
    status: parseOptionalProposalStatus(query.status),
    periodeId: parseOptionalNumber(query.periodeId),
    programStudi: parseOptionalString(query.programStudi),
    tahun: parseOptionalNumber(query.tahun),
    search: parseOptionalString(query.search),
  };
}

function parseMyProposalListQuery(query: Record<string, unknown>) {
  return {
    page: parseNumber(query.page, 1) ?? 1,
    limit: parseNumber(query.limit, 10) ?? 10,
    jenis: parseOptionalJenisKegiatan(query.jenis),
  };
}

function getUploadedFile(req: AuthRequest): Express.Multer.File {
  const file = (req as AuthRequest & { file?: Express.Multer.File }).file;

  if (!file) {
    throw new HttpError("File tidak ditemukan dalam request.", 400);
  }

  const validationResult = proposalDocumentSchema.safeParse({
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  });

  if (!validationResult.success) {
    const hasMimeError = validationResult.error.issues.some(
      (issue) => issue.path[0] === "mimetype",
    );
    const hasSizeError = validationResult.error.issues.some(
      (issue) => issue.path[0] === "size",
    );

    if (hasMimeError) {
      throw new HttpError("Hanya file PDF atau DOCX yang diizinkan.", 400);
    }

    if (hasSizeError) {
      throw new HttpError("Ukuran file maksimal 10 MB.", 400);
    }

    throw new HttpError("File tidak valid.", 400);
  }

  return file;
}

function ensureDocumentExists(
  doc: {
    dokumenBlob: Uint8Array | null;
    dokumenMime?: string | null;
    dokumenNama?: string | null;
    dokumenUkuran?: number | null;
  } | null,
): asserts doc is {
  dokumenBlob: Uint8Array;
  dokumenMime?: string | null;
  dokumenNama?: string | null;
  dokumenUkuran?: number | null;
} {
  if (!doc || !doc.dokumenBlob) {
    throw new HttpError("Dokumen tidak ditemukan.", 404);
  }
}

export const proposalController = {
  getAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const filters = parseProposalListQuery(
      req.query as Record<string, unknown>,
    );
    const result = await proposalService.findAll(filters);

    return sendSuccess(res, "Proposals fetched", result.proposals, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  }),

  getById: asyncHandler(async (req: AuthRequest, res: Response) => {
    const proposalId = parseProposalId(req.params.id);
    const result = await proposalService.findById(
      proposalId,
      req.user!.userId,
      req.user!.roles,
    );

    return sendSuccess(res, "Proposal fetched", result);
  }),

  getMy: asyncHandler(async (req: AuthRequest, res: Response) => {
    const filters = parseMyProposalListQuery(
      req.query as Record<string, unknown>,
    );
    const result = await proposalService.findByPengusul(
      req.user!.userId,
      filters,
    );

    return sendSuccess(res, "My proposals fetched", result.proposals, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  }),

  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await proposalService.create({
      ...req.body,
      pengusulId: req.user!.userId,
    });

    return sendSuccess(res, "Proposal created", result, 201);
  }),

  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    const proposalId = parseProposalId(req.params.id);

    const result = await proposalService.update(
      proposalId,
      req.user!.userId,
      req.user!.roles,
      req.body,
    );

    return sendSuccess(res, "Proposal updated", result);
  }),

  submit: asyncHandler(async (req: AuthRequest, res: Response) => {
    const proposalId = parseProposalId(req.params.id);
    const result = await proposalService.submit(
      proposalId,
      req.user!.userId,
      req.user!.roles,
    );

    return sendSuccess(res, "Proposal diajukan", result);
  }),

  updateStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const proposalId = parseProposalId(req.params.id);
    const { status, catatanRevisi } = req.body;

    const result = await proposalService.updateStatus(
      proposalId,
      req.user!.userId,
      status,
      catatanRevisi,
    );

    return sendSuccess(res, "Status proposal diperbarui", result);
  }),

  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    const proposalId = parseProposalId(req.params.id);

    await proposalService.delete(proposalId, req.user!.userId, req.user!.roles);

    return sendSuccess(res, "Proposal deleted");
  }),

  uploadDokumen: asyncHandler(async (req: AuthRequest, res: Response) => {
    const proposalId = parseProposalId(req.params.id);
    const file = getUploadedFile(req);

    const result = await proposalService.saveDokumen(
      proposalId,
      req.user!.userId,
      req.user!.roles,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
    );

    return sendSuccess(res, "Dokumen berhasil diunggah", result);
  }),

  downloadDokumen: asyncHandler(async (req: AuthRequest, res: Response) => {
    const proposalId = parseProposalId(req.params.id);
    const doc = await proposalService.getDokumen(
      proposalId,
      req.user!.userId,
      req.user!.roles,
    );

    ensureDocumentExists(doc);

    // X-Content-Type-Options: nosniff — instruksikan browser untuk PERCAYA
    // Content-Type yang di-set di sini, jangan menebak tipe file dari isi
    // (content-sniffing). Defense-in-depth: meski Content-Type sekarang
    // sudah berasal dari deteksi magic-bytes saat upload (bukan lagi klaim
    // client mentah — lihat saveDokumen di proposal.service.ts), header ini
    // tetap dipasang untuk lapisan proteksi tambahan di sisi browser.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Type",
      doc.dokumenMime || "application/octet-stream",
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(doc.dokumenNama || "dokumen")}"`,
    );
    res.setHeader(
      "Content-Length",
      doc.dokumenUkuran ?? doc.dokumenBlob.length,
    );
    res.end(doc.dokumenBlob);
  }),
};

export const proposalErrorHandler = (
  err: Error & { statusCode?: number },
  _req: AuthRequest,
  res: Response,
  _next: NextFunction,
) => {
  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500 ? "Internal server error" : err.message;

  return res.status(statusCode).json({
    success: false,
    message,
  });
};
