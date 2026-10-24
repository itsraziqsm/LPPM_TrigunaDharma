import { Router } from "express";
import { dashboardController } from "../controllers/dashboard.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";

const dashboardRouter = Router();

/**
 * Semua endpoint dashboard wajib terautentikasi
 */
dashboardRouter.use(authenticate);

/**
 * Statistik dashboard untuk admin dan ketua LPPM
 * GET /dashboard/stats
 */
dashboardRouter.get(
  "/stats",
  authorize("admin", "ketua_lppm"),
  dashboardController.getStats,
);

export default dashboardRouter;
