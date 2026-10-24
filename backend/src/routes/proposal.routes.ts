import { Router } from "express";
import multer from "multer";

import { dokumenController } from "../controllers/dokumen.controller";
import { laporanController } from "../controllers/laporan.controller";
import { proposalController } from "../controllers/proposal.controller";
import { reviewerController } from "../controllers/reviewer.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  createDokumenSchema,
  createLaporanSchema,
  createProposalSchema,
  submitReviewSchema,
  tugaskanReviewerSchema,
  updateLaporanSchema,
  updateProposalSchema,
  updateStatusProposalSchema,
} from "../validators/proposal.validator";

const proposalRouter = Router();

const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    // fieldNestingDepth: batas kedalaman nested bracket notation di nama
    // field multipart (mis. "a[b][c]"). Direkomendasikan eksplisit oleh
    // advisory CVE-2026-5079 (DoS via deeply nested field names) sebagai
    // defense-in-depth tambahan di atas fix struktural yang sudah ada di
    // multer 2.2.0. Form upload di sini tidak butuh nested field sama
    // sekali (cuma field "file" tunggal), jadi nilai kecil aman dipakai.
    // Di-cast eksplisit karena opsi ini baru ditambahkan di multer 2.2.0
    // (Juni 2026); kalau @types/multer yang terpasang belum memuat field
    // ini di definisi TypeScript-nya, cast berikut mencegah build gagal
    // sambil tetap berfungsi penuh saat runtime (limits diteruskan mentah
    // ke Busboy, jadi Multer sendiri sudah mendukungnya secara fungsional
    // terlepas dari cakupan definisi tipe komunitasnya).
    ...({ fieldNestingDepth: 5 } as Record<string, unknown>),
  },
  fileFilter: (_req, file, cb) => {
    const isAllowedFileType = ALLOWED_DOCUMENT_MIME_TYPES.includes(
      file.mimetype,
    );

    if (isAllowedFileType) {
      cb(null, true);
      return;
    }

    cb(new Error("Hanya file PDF atau DOCX yang diizinkan."));
  },
});

/**
 * Semua route proposal wajib terautentikasi
 */
proposalRouter.use(authenticate);

/**
 * Proposal CRUD
 *
 * GET /:id dan GET /:id/dokumen-utama sengaja tidak dipasangi
 * authorize(...) role-check: kewenangan aksesnya tergantung keterkaitan
 * user dengan proposal tsb (pengusul/anggota diterima/reviewer
 * ditugaskan/admin/ketua_lppm), bukan sekadar role. Pengecekan itu
 * dilakukan di proposalService lewat ensureProposalAccess (lihat
 * services/proposalAccess.ts).
 */
proposalRouter.get(
  "/",
  authorize("admin", "ketua_lppm", "reviewer"),
  proposalController.getAll,
);

proposalRouter.get("/my", proposalController.getMy);
proposalRouter.get("/:id", proposalController.getById);

proposalRouter.post(
  "/",
  authorize("dosen", "mahasiswa"),
  validate(createProposalSchema),
  proposalController.create,
);

proposalRouter.patch(
  "/:id",
  authorize("dosen", "mahasiswa"),
  validate(updateProposalSchema),
  proposalController.update,
);

proposalRouter.post(
  "/:id/submit",
  authorize("dosen", "mahasiswa"),
  proposalController.submit,
);

proposalRouter.patch(
  "/:id/status",
  authorize("ketua_lppm", "admin"),
  validate(updateStatusProposalSchema),
  proposalController.updateStatus,
);

proposalRouter.delete(
  "/:id",
  authorize("dosen", "mahasiswa", "admin"),
  proposalController.delete,
);

/**
 * Dokumen utama proposal
 */
proposalRouter.post(
  "/:id/dokumen-utama",
  authorize("dosen", "mahasiswa"),
  uploadDocument.single("file"),
  proposalController.uploadDokumen,
);

proposalRouter.get("/:id/dokumen-utama", proposalController.downloadDokumen);

/**
 * Reviewer assignment & reviews
 */
proposalRouter.post(
  "/:proposalId/reviewers",
  authorize("ketua_lppm", "admin"),
  validate(tugaskanReviewerSchema),
  reviewerController.tugaskan,
);

proposalRouter.delete(
  "/:proposalId/reviewers/:reviewerId",
  authorize("ketua_lppm", "admin"),
  reviewerController.hapusTugasan,
);

proposalRouter.get(
  "/:proposalId/reviews",
  authorize("ketua_lppm", "admin", "reviewer"),
  reviewerController.getReviewsByProposal,
);

proposalRouter.post(
  "/:proposalId/reviews",
  authorize("reviewer"),
  validate(submitReviewSchema),
  reviewerController.submitReview,
);

proposalRouter.post(
  "/:proposalId/reviews/finalize",
  authorize("reviewer"),
  reviewerController.finalizeReview,
);

/**
 * Laporan proposal
 *
 * Route GET di bawah ini sengaja tidak dipasangi authorize(...) role-check:
 * siapa yang boleh mengakses laporan tertentu tergantung keterkaitannya
 * dengan proposal (pengusul/anggota diterima/reviewer ditugaskan/admin/
 * ketua_lppm), bukan sekadar role. Pengecekan itu dilakukan di service
 * layer lewat ensureProposalAccess (lihat services/proposalAccess.ts),
 * yang lebih tepat untuk aturan "boleh akses kalau terkait" seperti ini.
 */
proposalRouter.get("/:proposalId/laporan", laporanController.getByProposal);

proposalRouter.post(
  "/:proposalId/laporan",
  authorize("dosen", "mahasiswa"),
  uploadDocument.single("file"),
  laporanController.create,
);

proposalRouter.get("/laporan/:id/download", laporanController.download);

proposalRouter.patch(
  "/laporan/:id",
  authorize("dosen", "mahasiswa", "admin"),
  validate(updateLaporanSchema),
  laporanController.update,
);

proposalRouter.delete(
  "/laporan/:id",
  authorize("dosen", "mahasiswa", "admin"),
  laporanController.delete,
);

/**
 * Dokumen lampiran proposal
 * Sama seperti route laporan di atas: authorization berbasis keterkaitan
 * proposal (bukan role semata) ditegakkan di service layer.
 */
proposalRouter.get("/:proposalId/dokumen", dokumenController.getByProposal);

proposalRouter.post(
  "/:proposalId/dokumen",
  authorize("dosen", "mahasiswa"),
  uploadDocument.single("file"),
  dokumenController.create,
);

proposalRouter.get("/dokumen/:id/download", dokumenController.download);

proposalRouter.delete(
  "/dokumen/:id",
  authorize("dosen", "mahasiswa", "admin"),
  dokumenController.delete,
);

export default proposalRouter;
