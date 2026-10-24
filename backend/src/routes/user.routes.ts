import { Router } from "express";

import { userController } from "../controllers/user.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  assignRoleSchema,
  paginationSchema,
  updateUserStatusSchema,
} from "../validators/user.validator";

const userRouter = Router();

/**
 * Semua endpoint user wajib login
 */
userRouter.use(authenticate);

/**
 * Search user untuk dropdown anggota
 * Hanya mengembalikan data aman seperti id, name, email, dan programStudi
 * GET /users/search
 */
userRouter.get("/search", userController.search);

/**
 * Own profile routes
 * Harus sebelum /:id agar tidak tertangkap sebagai route parameter
 */
userRouter.patch("/profile/me", userController.updateProfile);
userRouter.patch("/profile/password", userController.changePassword);

/**
 * Admin & Ketua LPPM routes
 */
userRouter.get(
  "/",
  authorize("admin", "ketua_lppm"),
  validate(paginationSchema, "query"),
  userController.getAll,
);

userRouter.get(
  "/:id",
  authorize("admin", "ketua_lppm"),
  userController.getById,
);

userRouter.patch(
  "/:id/status",
  authorize("admin"),
  validate(updateUserStatusSchema),
  userController.updateStatus,
);

userRouter.patch(
  "/:id/roles",
  authorize("admin"),
  validate(assignRoleSchema),
  userController.assignRoles,
);

userRouter.delete("/:id", authorize("admin"), userController.deleteUser);

export default userRouter;
