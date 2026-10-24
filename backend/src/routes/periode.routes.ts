import { Router } from "express";
import { periodeController } from "../controllers/periode.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  createPeriodeSchema,
  updatePeriodeSchema,
} from "../validators/periode.validator";

const periodeRouter = Router();

periodeRouter.use(authenticate);

// Read
periodeRouter.get("/", periodeController.getAll);
periodeRouter.get("/:id", periodeController.getById);

// Write — admin & ketua_lppm
periodeRouter.post(
  "/",
  authorize("admin", "ketua_lppm"),
  validate(createPeriodeSchema),
  periodeController.create,
);

periodeRouter.patch(
  "/:id",
  authorize("admin", "ketua_lppm"),
  validate(updatePeriodeSchema),
  periodeController.update,
);

// 2-Step Delete endpoints
periodeRouter.get(
  "/:id/deletion-request",
  authorize("admin", "ketua_lppm"),
  periodeController.getPendingDeletionRequest,
);

periodeRouter.post(
  "/:id/deletion-request",
  authorize("admin", "ketua_lppm"),
  periodeController.requestDelete,
);

periodeRouter.post(
  "/deletion-request/:requestId/approve",
  authorize("admin", "ketua_lppm"),
  periodeController.approveDelete,
);

periodeRouter.post(
  "/deletion-request/:requestId/cancel",
  authorize("admin", "ketua_lppm"),
  periodeController.cancelDeleteRequest,
);

export default periodeRouter;
