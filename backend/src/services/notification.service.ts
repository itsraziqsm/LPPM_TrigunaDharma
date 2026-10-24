import { NotifType, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

type CreateNotificationInput = {
  userId: number;
  type: NotifType;
  judul: string;
  pesan: string;
  refId?: number;
  refType?: string;
};

type FindUserNotificationsParams = {
  page: number;
  limit: number;
  onlyUnread?: boolean;
};

const NOTIFICATION_ORDER_BY: Prisma.NotificationOrderByWithRelationInput = {
  createdAt: "desc",
};

const buildNotificationWhere = (
  userId: number,
  onlyUnread?: boolean,
): Prisma.NotificationWhereInput => {
  return {
    userId,
    ...(onlyUnread ? { isRead: false } : {}),
  };
};

const calculateSkip = (page: number, limit: number): number => {
  return (page - 1) * limit;
};

const createNotification = async (data: CreateNotificationInput) => {
  return prisma.notification.create({ data });
};

const findNotificationsByUser = async (
  userId: number,
  params: FindUserNotificationsParams,
) => {
  const { page, limit, onlyUnread } = params;
  const skip = calculateSkip(page, limit);
  const where = buildNotificationWhere(userId, onlyUnread);

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take: limit,
      orderBy: NOTIFICATION_ORDER_BY,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    }),
  ]);

  return {
    notifications,
    total,
    unreadCount,
    page,
    limit,
  };
};

const markNotificationAsRead = async (id: number, userId: number) => {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
};

const markAllNotificationsAsRead = async (userId: number) => {
  return prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: { isRead: true },
  });
};

const deleteNotification = async (id: number, userId: number) => {
  await prisma.notification.deleteMany({
    where: { id, userId },
  });
};

export const notificationService = {
  create: createNotification,
  findByUser: findNotificationsByUser,
  markRead: markNotificationAsRead,
  markAllRead: markAllNotificationsAsRead,
  delete: deleteNotification,
};
