import { Response } from "express";
import { notificationService } from "../services/notification.service";
import { sendSuccess } from "../utils/response";
import { AuthRequest } from "../types";

type NotificationQueryParams = {
  page?: string;
  limit?: string;
  onlyUnread?: string;
};

type NotificationRouteParams = {
  id: string;
};

const parseNotificationQuery = (query: NotificationQueryParams) => {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const onlyUnread = query.onlyUnread === "true";

  return {
    page,
    limit,
    onlyUnread,
  };
};

const parseNotificationIdParam = (params: NotificationRouteParams): number => {
  return Number(params.id);
};

export const notificationController = {
  async getMy(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const { page, limit, onlyUnread } = parseNotificationQuery(
      req.query as NotificationQueryParams,
    );

    const result = await notificationService.findByUser(userId, {
      page,
      limit,
      onlyUnread,
    });

    return sendSuccess(
      res,
      "Notifications fetched",
      result.notifications,
      200,
      {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    );
  },

  async markRead(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const notificationId = parseNotificationIdParam(
      req.params as NotificationRouteParams,
    );

    await notificationService.markRead(notificationId, userId);

    return sendSuccess(res, "Notification marked as read");
  },

  async markAllRead(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;

    await notificationService.markAllRead(userId);

    return sendSuccess(res, "All notifications marked as read");
  },

  async delete(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const notificationId = parseNotificationIdParam(
      req.params as NotificationRouteParams,
    );

    await notificationService.delete(notificationId, userId);

    return sendSuccess(res, "Notification deleted");
  },
};
