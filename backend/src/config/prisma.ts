import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { logger } from "../utils/logger";

type GlobalPrisma = typeof globalThis & {
  prisma?: PrismaClient;
};
const globalForPrisma = globalThis as GlobalPrisma;

function buildPrismaLogConfig(): Prisma.LogLevel[] {
  if (process.env.NODE_ENV === "development") {
    return ["query", "error", "warn"];
  }
  return ["error"];
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  return new PrismaClient({
    adapter,
    log: buildPrismaLogConfig(),
  });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function connectDB(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info("Database connected");
  } catch (error) {
    logger.error("Database connection failed", error);
    process.exit(1);
  }
}