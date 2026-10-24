import { Router } from "express";
import { exportController } from "../controllers/export.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";

const exportRouter = Router();

exportRouter.use(authenticate);

/**
 * Data export untuk tabel & PDF/Excel di frontend
 * GET /export/proposals
 * Query: periodeId, jenis, status, tahun, programStudi
 */
exportRouter.get(
  "/proposals",
  authorize("admin", "ketua_lppm"),
  exportController.getData,
);

export default exportRouter;
