import { Router } from "express";
import { proposalDosenController } from "../controllers/Proposaldosen.controller ";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  createProposalSchema,
  updateProposalSchema,
} from "../validators/proposal.validator";

const proposalDosenRouter = Router();

/**
 * Semua endpoint modul proposal dosen/mahasiswa
 * hanya dapat diakses oleh user terautentikasi
 * dengan role dosen atau mahasiswa
 */
proposalDosenRouter.use(authenticate);
proposalDosenRouter.use(authorize("dosen", "mahasiswa"));

/**
 * Static routes
 * Harus diletakkan sebelum /:id
 */
proposalDosenRouter.get("/stats", proposalDosenController.getStats);
proposalDosenRouter.get(
  "/members/search",
  proposalDosenController.searchMembers,
);
proposalDosenRouter.get(
  "/invitations",
  proposalDosenController.getMyInvitations,
);
proposalDosenRouter.patch(
  "/invitations/:id",
  proposalDosenController.respondInvitation,
);

/**
 * Collection routes
 */
proposalDosenRouter.get("/", proposalDosenController.getMyProposals);
proposalDosenRouter.post(
  "/",
  validate(createProposalSchema),
  proposalDosenController.create,
);

/**
 * Single proposal routes
 */
proposalDosenRouter.get("/:id", proposalDosenController.getById);
proposalDosenRouter.patch(
  "/:id",
  validate(updateProposalSchema),
  proposalDosenController.update,
);
proposalDosenRouter.post("/:id/submit", proposalDosenController.submit);
proposalDosenRouter.delete("/:id", proposalDosenController.delete);

export default proposalDosenRouter;
