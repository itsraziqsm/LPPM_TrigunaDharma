import { Response } from "express";
import { JenisKegiatan, RoleName } from "@prisma/client";
import { periodeService } from "../services/periode.service";
import { sendSuccess, sendError } from "../utils/response";
import { AuthRequest } from "../types";

type FindAllPeriodeParams = {
  jenis?: JenisKegiatan;
  tahun?: number;
  isAktif?: boolean;
};

const getQueryString = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }
  return undefined;
};

const parseNumberFromQuery = (value: unknown): number | undefined => {
  const s = getQueryString(value);
  return s === undefined ? undefined : Number(s);
};

const parseBooleanFromQuery = (value: unknown): boolean | undefined => {
  const s = getQueryString(value);
  return s === undefined ? undefined : s === "true";
};

const parseJenisKegiatanFromQuery = (
  value: unknown,
): JenisKegiatan | undefined => {
  const s = getQueryString(value);
  return s === undefined ? undefined : (s as JenisKegiatan);
};

const parsePeriodeFilters = (
  query: AuthRequest["query"],
): FindAllPeriodeParams => ({
  jenis: parseJenisKegiatanFromQuery(query.jenis),
  tahun: parseNumberFromQuery(query.tahun),
  isAktif: parseBooleanFromQuery(query.isAktif),
});

export const periodeController = {
  async getAll(req: AuthRequest, res: Response) {
    const filters = parsePeriodeFilters(req.query);
    const result = await periodeService.findAll(filters);
    return sendSuccess(res, "Periode fetched", result);
  },

  async getById(req: AuthRequest, res: Response) {
    const result = await periodeService.findById(Number(req.params.id));
    return sendSuccess(res, "Periode fetched", result);
  },

  async create(req: AuthRequest, res: Response) {
    const result = await periodeService.create(req.body);
    return sendSuccess(res, "Periode created", result, 201);
  },

  async update(req: AuthRequest, res: Response) {
    const result = await periodeService.update(Number(req.params.id), req.body);
    return sendSuccess(res, "Periode updated", result);
  },

  // ── 2-Step Delete ──────────────────────────────────────────────────────────

  async requestDelete(req: AuthRequest, res: Response) {
    const { password } = req.body;
    if (!password) return sendError(res, "Password wajib diisi", 400);

    const userId = req.user!.userId;
    const roles = req.user!.roles as RoleName[];

    const result = await periodeService.requestDelete(
      Number(req.params.id),
      userId,
      roles,
      password,
    );
    return sendSuccess(res, "Permintaan penghapusan berhasil dibuat", result);
  },

  async approveDelete(req: AuthRequest, res: Response) {
    const { password } = req.body;
    if (!password) return sendError(res, "Password wajib diisi", 400);

    const userId = req.user!.userId;
    const roles = req.user!.roles as RoleName[];

    await periodeService.approveDelete(
      Number(req.params.requestId),
      userId,
      roles,
      password,
    );
    return sendSuccess(res, "Periode berhasil dihapus");
  },

  async getPendingDeletionRequest(req: AuthRequest, res: Response) {
    const result = await periodeService.getPendingDeletionRequest(
      Number(req.params.id),
    );
    return sendSuccess(res, "Pending deletion request", result);
  },

  async cancelDeleteRequest(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const roles = req.user!.roles as RoleName[];

    await periodeService.cancelDeleteRequest(
      Number(req.params.requestId),
      userId,
      roles,
    );
    return sendSuccess(res, "Permintaan penghapusan dibatalkan");
  },
};
