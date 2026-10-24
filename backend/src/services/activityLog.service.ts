import { prisma } from "../config/prisma";
import { requestContext } from "../utils/requestContext";

type ActivityLogCreateInput = {
  userId: number;
  action: string;
  entityType?: string;
  entityId?: number;
  detail?: string;
  proposalId?: number;
  ipAddress?: string;
  userAgent?: string;
};

type PaginationParams = {
  page: number;
  limit: number;
};

type FindAllActivityLogParams = PaginationParams & {
  userId?: number;
  action?: string;
};

const buildPagination = ({ page, limit }: PaginationParams) => ({
  skip: (page - 1) * limit,
  take: limit,
});

const proposalSummarySelect = {
  id: true,
  judul: true,
  jenis: true,
} as const;

const userSummarySelect = {
  id: true,
  name: true,
  email: true,
} as const;

const buildFindAllWhereClause = ({
  userId,
  action,
}: Pick<FindAllActivityLogParams, "userId" | "action">) => ({
  ...(userId !== undefined ? { userId } : {}),
  ...(action ? { action: { contains: action } } : {}),
});

export const activityLogService = {
  async log(data: ActivityLogCreateInput) {
    // ip/userAgent diambil otomatis dari request yang sedang berjalan
    // (lewat AsyncLocalStorage), supaya 10 titik pemanggilan .log() yang
    // sudah ada di berbagai service TIDAK perlu diubah satu per satu.
    // Kalau caller sudah kirim ipAddress/userAgent secara eksplisit
    // (misal dari script non-HTTP seperti cron/seed), nilai itu yang menang.
    const context = requestContext.get();

    return prisma.activityLog.create({
      data: {
        ...data,
        ipAddress: data.ipAddress ?? context.ip ?? undefined,
        userAgent: data.userAgent ?? context.userAgent ?? undefined,
      },
    });
  },

  async findByUser(userId: number, params: PaginationParams) {
    const { page, limit } = params;
    const { skip, take } = buildPagination(params);
    const where = { userId };

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          proposal: {
            select: proposalSummarySelect,
          },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      limit,
    };
  },

  async findAll(params: FindAllActivityLogParams) {
    const { page, limit, userId, action } = params;
    const { skip, take } = buildPagination(params);
    const where = buildFindAllWhereClause({ userId, action });

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: userSummarySelect,
          },
          proposal: {
            select: proposalSummarySelect,
          },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      limit,
    };
  },
};
