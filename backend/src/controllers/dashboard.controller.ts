import { Response } from "express";
import { dashboardService } from "../services/dashboard.service";
import { sendSuccess } from "../utils/response";
import { AuthRequest } from "../types";

type GetDashboardStatsQuery = {
  tahun?: string;
  jenis?: string;
};

type DashboardStatsParams = NonNullable<
  Parameters<typeof dashboardService.getStats>[0]
>;

type DashboardJenis = DashboardStatsParams["jenis"];

function parseDashboardStatsQuery(
  query: GetDashboardStatsQuery,
): DashboardStatsParams {
  return {
    tahun: query.tahun ? Number(query.tahun) : undefined,
    jenis: query.jenis as DashboardJenis,
  };
}

export const dashboardController = {
  async getStats(req: AuthRequest, res: Response) {
    const query = req.query as GetDashboardStatsQuery;
    const filters = parseDashboardStatsQuery(query);

    const result = await dashboardService.getStats(filters);

    return sendSuccess(res, "Dashboard stats fetched", result);
  },
};
