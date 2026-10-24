import { Response } from "express";
import { activityLogService } from "../services/activityLog.service";
import { sendSuccess } from "../utils/response";
import { AuthRequest } from "../types";

type PaginationQuery = {
  page?: string | number;
  limit?: string | number;
};

type GetAllActivityLogQuery = PaginationQuery & {
  userId?: string | number;
  action?: string;
};

type ActivityLogListResult = {
  logs: unknown;
  page: number;
  limit: number;
  total: number;
};

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parsePaginationQuery(query: PaginationQuery) {
  return {
    page: toNumber(query.page, 1),
    limit: toNumber(query.limit, 20),
  };
}

function parseGetAllActivityLogQuery(query: GetAllActivityLogQuery) {
  const { page, limit } = parsePaginationQuery(query);

  return {
    page,
    limit,
    userId:
      query.userId !== undefined && query.userId !== null && query.userId !== ""
        ? toNumber(query.userId, NaN)
        : undefined,
    action: query.action,
  };
}

function sendActivityLogListResponse(
  res: Response,
  result: ActivityLogListResult,
) {
  return sendSuccess(res, "Activity logs fetched", result.logs, 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  });
}

export const activityLogController = {
  async getMy(req: AuthRequest, res: Response) {
    const pagination = parsePaginationQuery(req.query as PaginationQuery);

    const result = await activityLogService.findByUser(req.user!.userId, {
      page: pagination.page,
      limit: pagination.limit,
    });

    return sendActivityLogListResponse(res, result);
  },

  async getAll(req: AuthRequest, res: Response) {
    const filters = parseGetAllActivityLogQuery(
      req.query as GetAllActivityLogQuery,
    );

    const result = await activityLogService.findAll({
      page: filters.page,
      limit: filters.limit,
      userId: filters.userId,
      action: filters.action,
    });

    return sendActivityLogListResponse(res, result);
  },
};
