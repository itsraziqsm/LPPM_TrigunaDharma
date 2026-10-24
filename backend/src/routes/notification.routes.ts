import { Router } from "express";
import { notificationController } from "../controllers/notification.controller";
import { authenticate } from "../middlewares/auth.middleware";

const notificationRouter = Router();

/**
 * Semua endpoint notifikasi wajib login
 */
notificationRouter.use(authenticate);

/**
 * Ambil semua notifikasi milik user yang sedang login
 * GET /notifications
 */
notificationRouter.get("/", notificationController.getMy);

/**
 * Tandai semua notifikasi sebagai sudah dibaca
 * Route statis diletakkan sebelum route dinamis
 * PATCH /notifications/read-all
 */
notificationRouter.patch("/read-all", notificationController.markAllRead);

/**
 * Tandai satu notifikasi sebagai sudah dibaca
 * PATCH /notifications/:id/read
 */
notificationRouter.patch("/:id/read", notificationController.markRead);

/**
 * Hapus satu notifikasi
 * DELETE /notifications/:id
 */
notificationRouter.delete("/:id", notificationController.delete);

export default notificationRouter;
