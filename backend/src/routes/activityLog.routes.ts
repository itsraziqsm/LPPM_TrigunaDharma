import { Router } from "express";
import { activityLogController } from "../controllers/activityLog.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";

const activityLogRouter = Router();

/**
 * Semua endpoint activity log wajib login
 */
activityLogRouter.use(authenticate);

/**
 * User melihat riwayat aktivitas miliknya sendiri
 * GET /activity-logs/my
 */
activityLogRouter.get("/my", activityLogController.getMy);

/**
 * Admin dan ketua LPPM melihat seluruh riwayat aktivitas
 * GET /activity-logs
 */
activityLogRouter.get(
  "/",
  authorize("admin", "ketua_lppm"),
  activityLogController.getAll,
);

export default activityLogRouter;
