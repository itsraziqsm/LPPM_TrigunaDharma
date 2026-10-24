import "dotenv/config";
import "express-async-errors";
import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { requestContext } from "./utils/requestContext";
import { notFound, errorHandler } from "./middlewares/error.middleware";
import { accessLogger, accessFileLogger } from "./middlewares/accessLog.middleware";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import periodeRoutes from "./routes/periode.routes";
import proposalRoutes from "./routes/proposal.routes";
import reviewerRoutes from "./routes/reviewer.routes";
import notificationRoutes from "./routes/notification.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import activityLogRoutes from "./routes/activityLog.routes";
import proposalDosenRoutes from "./routes/Proposaldosen.routes";
import laporanHarianRoutes from "./routes/laporanHarian.routes";
import exportRoutes from "./routes/export.routes";

const app: Application = express();

// Kalau app ini jalan di belakang reverse proxy (Nginx, load balancer, dll),
// req.ip akan menunjukkan IP proxy, bukan IP client asli, kecuali trust proxy
// diaktifkan. Dikontrol lewat env var supaya bisa berbeda per environment
// (misal: false saat dev localhost, true saat production di belakang Nginx).
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

const getEnvNumber = (value: string | undefined, fallback: number): number => {
  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) || parsedValue <= 0 ? fallback : parsedValue;
};

const config = {
  corsOrigin: process.env.CORS_ORIGIN || "*",
  rateLimitWindowMs: getEnvNumber(
    process.env.RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000,
  ),
  rateLimitMax: getEnvNumber(process.env.RATE_LIMIT_MAX, 500),
};

function registerAccessLog(app: Application): void {
  app.use(accessLogger);
  app.use(accessFileLogger);
}

function registerSecurityMiddlewares(app: Application): void {
  app.use(helmet());

  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: "Too many requests, please try again later.",
      },
    }),
  );
}

function registerParsers(app: Application): void {
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: true }));
}

function registerHealthCheck(app: Application): void {
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      success: true,
      message: "OK",
      timestamp: new Date().toISOString(),
    });
  });
}

function registerApiRoutes(app: Application): void {
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/users", userRoutes);
  app.use("/api/v1/periode", periodeRoutes);
  app.use("/api/v1/proposals", proposalRoutes);
  app.use("/api/v1/dosen/proposals", proposalDosenRoutes);
  app.use("/api/v1/mahasiswa/laporan-harian", laporanHarianRoutes);
  app.use("/api/v1/reviewer", reviewerRoutes);
  app.use("/api/v1/notifications", notificationRoutes);
  app.use("/api/v1/dashboard", dashboardRoutes);
  app.use("/api/v1/activity-logs", activityLogRoutes);
  app.use("/api/v1/export", exportRoutes);
}

function registerErrorHandlers(app: Application): void {
  app.use(notFound);
  app.use(errorHandler);
}

function configureApp(app: Application): Application {
  // Harus paling pertama: AsyncLocalStorage context ini "membungkus" seluruh
  // sisa request lifecycle, jadi middleware/route apapun yang jalan setelah
  // ini (termasuk service layer beberapa lapis di bawah) bisa akses
  // requestContext.get() untuk dapat ip/userAgent request yang sedang aktif.
  app.use(requestContext.middleware);
  registerAccessLog(app);
  registerSecurityMiddlewares(app);
  registerParsers(app);
  registerHealthCheck(app);
  registerApiRoutes(app);
  registerErrorHandlers(app);

  return app;
}

configureApp(app);

export default app;
