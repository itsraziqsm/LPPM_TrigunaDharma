import { Response } from "express";
import { RoleName } from "@prisma/client";
import { laporanService } from "../services/laporan.service";
import { sendSuccess } from "../utils/response";
import { AuthRequest } from "../types";

type LaporanByIdParams = {
  id: string;
};

type LaporanByProposalParams = {
  proposalId: string;
};

type TypedAuthRequest<TParams = Record<string, string>> = AuthRequest & {
  params: TParams;
};

function parseRequiredNumberParam(
  value: string | undefined,
  paramName: string,
): number {
  const parsedValue = Number(value);

  if (!value || Number.isNaN(parsedValue)) {
    const error = new Error(`Parameter ${paramName} tidak valid.`);
    (error as any).statusCode = 400;
    throw error;
  }

  return parsedValue;
}

function getAuthenticatedUserId(req: AuthRequest): number {
  const userId = req.user?.userId;

  if (!userId) {
    const error = new Error("Unauthorized");
    (error as any).statusCode = 401;
    throw error;
  }

  return userId;
}

function getAuthenticatedUserRoles(req: AuthRequest): RoleName[] {
  const roles = req.user?.roles;

  if (!roles) {
    const error = new Error("Unauthorized");
    (error as any).statusCode = 401;
    throw error;
  }

  return roles;
}

function getUploadedFile(req: AuthRequest): Express.Multer.File | undefined {
  return (req as AuthRequest & { file?: Express.Multer.File }).file;
}

function sendLaporanFile(
  res: Response,
  laporan: {
    dokumenBlob: Buffer | Uint8Array | null;
    dokumenMime?: string | null;
    dokumenNama?: string | null;
    dokumenUkuran?: number | null;
  },
) {
  // X-Content-Type-Options: nosniff — instruksikan browser untuk PERCAYA
  // Content-Type yang di-set di sini, jangan menebak tipe file dari isi
  // (content-sniffing). Defense-in-depth: meski Content-Type sekarang
  // sudah berasal dari deteksi magic-bytes saat upload (bukan lagi klaim
  // client mentah), header ini tetap dipasang untuk lapisan proteksi
  // tambahan di sisi browser.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Type",
    laporan.dokumenMime || "application/octet-stream",
  );
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(laporan.dokumenNama || "laporan")}"`,
  );
  res.setHeader(
    "Content-Length",
    laporan.dokumenUkuran ?? laporan.dokumenBlob!.length,
  );
  res.end(laporan.dokumenBlob);
}

export const laporanController = {
  async getByProposal(
    req: TypedAuthRequest<LaporanByProposalParams>,
    res: Response,
  ) {
    const proposalId = parseRequiredNumberParam(
      req.params.proposalId,
      "proposalId",
    );
    const userId = getAuthenticatedUserId(req);
    const userRoles = getAuthenticatedUserRoles(req);
    const result = await laporanService.findByProposal(
      proposalId,
      userId,
      userRoles,
    );

    return sendSuccess(res, "Laporan fetched", result);
  },

  async create(req: TypedAuthRequest<LaporanByProposalParams>, res: Response) {
    const proposalId = parseRequiredNumberParam(
      req.params.proposalId,
      "proposalId",
    );
    const userId = getAuthenticatedUserId(req);
    const userRoles = getAuthenticatedUserRoles(req);
    const file = getUploadedFile(req);

    const result = await laporanService.create(proposalId, userId, userRoles, {
      jenis: req.body.jenis,
      judul: req.body.judul,
      dokumenUrl: req.body.dokumenUrl,
      keterangan: req.body.keterangan,
      file,
    });

    return sendSuccess(res, "Laporan diunggah", result, 201);
  },

  async download(req: TypedAuthRequest<LaporanByIdParams>, res: Response) {
    const laporanId = parseRequiredNumberParam(req.params.id, "id");
    const userId = getAuthenticatedUserId(req);
    const userRoles = getAuthenticatedUserRoles(req);
    const laporan = await laporanService.findById(laporanId, userId, userRoles);

    if (!laporan || !laporan.dokumenBlob) {
      res
        .status(404)
        .json({ success: false, message: "File laporan tidak ditemukan." });
      return;
    }

    sendLaporanFile(res, laporan);
  },

  async update(req: TypedAuthRequest<LaporanByIdParams>, res: Response) {
    const laporanId = parseRequiredNumberParam(req.params.id, "id");
    const userId = getAuthenticatedUserId(req);
    const userRoles = getAuthenticatedUserRoles(req);
    const result = await laporanService.update(
      laporanId,
      userId,
      userRoles,
      req.body,
    );

    return sendSuccess(res, "Laporan updated", result);
  },

  async delete(req: TypedAuthRequest<LaporanByIdParams>, res: Response) {
    const laporanId = parseRequiredNumberParam(req.params.id, "id");
    const userId = getAuthenticatedUserId(req);
    const userRoles = getAuthenticatedUserRoles(req);

    await laporanService.delete(laporanId, userId, userRoles);

    return sendSuccess(res, "Laporan deleted");
  },
};
