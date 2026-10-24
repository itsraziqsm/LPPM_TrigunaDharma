import fs from "fs";
import path from "path";
import morgan, { StreamOptions } from "morgan";
import { RequestHandler } from "express";
import { logger } from "../utils/logger";

const isProduction = process.env.NODE_ENV === "production";

const logsDir = path.join(process.cwd(), "logs");

const ensureLogsDir = (): void => {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
};

// Alirkan output morgan ke winston, biar tetap satu pintu logging
// dan konsisten dengan format console yang sudah dipakai project ini.
const consoleStream: StreamOptions = {
  write: (message: string) => logger.info(message.trim()),
};

// GoAccess butuh file access log terpisah dalam format Apache "combined",
// jadi request log ditulis juga ke logs/access.log (append, tidak overwrite).
const createFileStream = (): fs.WriteStream => {
  ensureLogsDir();
  return fs.createWriteStream(path.join(logsDir, "access.log"), {
    flags: "a",
  });
};

// Dev: format ringkas berwarna di console.
// Prod: format "combined" (Apache-style) — ini yang dibaca GoAccess.
const consoleFormat = isProduction ? "combined" : "dev";

export const accessLogger: RequestHandler = morgan(consoleFormat, {
  stream: consoleStream,
});

export const accessFileLogger: RequestHandler = morgan("combined", {
  stream: createFileStream(),
});
