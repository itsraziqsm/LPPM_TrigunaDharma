import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/prisma";
import { logger } from "./utils/logger";

const getEnvNumber = (value: string | undefined, fallback: number): number => {
  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) || parsedValue <= 0 ? fallback : parsedValue;
};

const port = getEnvNumber(process.env.PORT, 3000);
const nodeEnv = process.env.NODE_ENV || "development";

async function bootstrap(): Promise<void> {
  await connectDB();

  app.listen(port, () => {
    logger.info(`Server running on port ${port} [${nodeEnv}]`);
  });
}

bootstrap();
