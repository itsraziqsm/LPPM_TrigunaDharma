import { Router } from "express";
import { reviewerController } from "../controllers/reviewer.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";

const reviewerRouter = Router();

/**
 * Semua endpoint reviewer wajib login
 */
reviewerRouter.use(authenticate);

/**
 * Reviewer melihat tugasan miliknya sendiri
 * Dosen/mahasiswa juga bisa ditugaskan sebagai reviewer
 * GET /reviewer/my-tugasan
 */
reviewerRouter.get(
  "/my-tugasan",
  authorize("reviewer", "dosen", "mahasiswa"),
  reviewerController.getMyTugasan,
);

export default reviewerRouter;
