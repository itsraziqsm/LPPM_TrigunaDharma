import { Response } from "express";
import { JenisKegiatan, ProposalStatus } from "@prisma/client";
import { exportService, ExportFilter } from "../services/export.service";
import { sendSuccess } from "../utils/response";
import { AuthRequest } from "../types";

type ExportQuery = {
  periodeId?: string;
  jenis?: string;
  status?: string;
  tahun?: string;
  programStudi?: string;
};

function parseExportQuery(query: ExportQuery): ExportFilter {
  return {
    periodeId: query.periodeId ? Number(query.periodeId) : undefined,
    jenis: query.jenis as JenisKegiatan | undefined,
    status: query.status as ProposalStatus | undefined,
    tahun: query.tahun ? Number(query.tahun) : undefined,
    programStudi: query.programStudi || undefined,
  };
}

export const exportController = {
  async getData(req: AuthRequest, res: Response) {
    const filter = parseExportQuery(req.query as ExportQuery);
    const result = await exportService.getExportData(filter);
    return sendSuccess(res, "Export data fetched", result);
  },
};
