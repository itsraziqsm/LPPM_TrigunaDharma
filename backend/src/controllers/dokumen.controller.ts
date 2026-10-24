import { Response } from "express";
import { dokumenService } from "../services/dokumen.service";
import { sendSuccess } from "../utils/response";
import { AuthRequest } from "../types";

type UploadedFile = Express.Multer.File | undefined;

type CreateDokumenPayload = {
  namaFile: string;
  fileUrl?: string;
  ukuran?: number;
  file?: UploadedFile;
};

function getSingleParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function parseNumberParam(value: string | string[]): number {
  return Number(getSingleParam(value));
}

function getUploadedFile(req: AuthRequest): UploadedFile {
  return (req as AuthRequest & { file?: Express.Multer.File }).file;
}

function buildCreateDokumenPayload(req: AuthRequest): CreateDokumenPayload {
  return {
    namaFile: req.body.namaFile,
    fileUrl: req.body.fileUrl,
    ukuran: req.body.ukuran ? Number(req.body.ukuran) : undefined,
    file: getUploadedFile(req),
  };
}

function setDownloadHeaders(
  res: Response,
  options: {
    mimeType?: string | null;
    fileName?: string | null;
    fallbackName: string;
    contentLength: number;
  },
): void {
  const resolvedFileName = options.fileName || options.fallbackName;

  // X-Content-Type-Options: nosniff — instruksikan browser untuk PERCAYA
  // Content-Type yang di-set di sini, jangan menebak tipe file dari isi
  // (content-sniffing). Defense-in-depth: meski Content-Type sekarang
  // sudah berasal dari deteksi magic-bytes saat upload (bukan lagi klaim
  // client mentah), header ini tetap dipasang untuk lapisan proteksi
  // tambahan di sisi browser.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", options.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(resolvedFileName)}"`,
  );
  res.setHeader("Content-Length", options.contentLength);
}

export const dokumenController = {
  async getByProposal(req: AuthRequest, res: Response) {
    const proposalId = parseNumberParam(req.params.proposalId);

    const result = await dokumenService.findByProposal(
      proposalId,
      req.user!.userId,
      req.user!.roles,
    );

    return sendSuccess(res, "Dokumen fetched", result);
  },

  async create(req: AuthRequest, res: Response) {
    const proposalId = parseNumberParam(req.params.proposalId);
    const userId = req.user!.userId;
    const payload = buildCreateDokumenPayload(req);

    const result = await dokumenService.create(
      proposalId,
      userId,
      req.user!.roles,
      payload,
    );

    return sendSuccess(res, "Dokumen uploaded", result, 201);
  },

  async download(req: AuthRequest, res: Response) {
    const dokumenId = parseNumberParam(req.params.id);
    const dok = await dokumenService.findById(
      dokumenId,
      req.user!.userId,
      req.user!.roles,
    );

    if (!dok || !dok.fileBlob) {
      res.status(404).json({
        success: false,
        message: "File dokumen tidak ditemukan.",
      });
      return;
    }

    const fileBuffer = dok.fileBlob as Buffer;

    setDownloadHeaders(res, {
      mimeType: dok.fileMime,
      fileName: dok.fileNama,
      fallbackName: dok.namaFile,
      contentLength: dok.ukuran ?? fileBuffer.length,
    });

    res.end(fileBuffer);
  },

  async delete(req: AuthRequest, res: Response) {
    const dokumenId = parseNumberParam(req.params.id);
    const userId = req.user!.userId;

    await dokumenService.delete(dokumenId, userId, req.user!.roles);

    return sendSuccess(res, "Dokumen deleted");
  },
};
