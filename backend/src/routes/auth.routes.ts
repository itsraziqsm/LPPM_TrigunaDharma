import { Router } from "express";
import rateLimit from "express-rate-limit";

import { authController } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerDosenSchema,
  registerMahasiswaSchema,
  resetPasswordSchema,
} from "../validators/user.validator";

/**
 * Rate limit ketat untuk endpoint auth yang rawan brute-force / abuse
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many attempts, try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limit khusus registrasi untuk mencegah spam pembuatan akun
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many registrations from this IP.",
  },
});

const authRouter = Router();

/**
 * Authentication & session
 */
authRouter.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  authController.login,
);
authRouter.post(
  "/refresh",
  validate(refreshTokenSchema),
  authController.refreshToken,
);
authRouter.post("/logout", validate(logoutSchema), authController.logout);
authRouter.post("/logout-all", authenticate, authController.logoutAll);

/**
 * Registration
 */
authRouter.post(
  "/register/dosen",
  registerLimiter,
  validate(registerDosenSchema),
  authController.registerDosen,
);

authRouter.post(
  "/register/mahasiswa",
  registerLimiter,
  validate(registerMahasiswaSchema),
  authController.registerMahasiswa,
);

/**
 * Password recovery
 */
authRouter.post(
  "/forgot-password",
  authLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);

authRouter.post(
  "/reset-password",
  authLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);

/**
 * Current authenticated user
 */
authRouter.get("/me", authenticate, authController.me);

export default authRouter;
