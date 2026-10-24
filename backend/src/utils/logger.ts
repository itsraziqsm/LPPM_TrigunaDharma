import winston from "winston";

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isProduction = process.env.NODE_ENV === "production";

const createLoggerFormat = (): winston.Logform.Format => {
  if (isProduction) {
    return combine(timestamp(), errors({ stack: true }), json());
  }

  return combine(timestamp(), errors({ stack: true }), colorize(), simple());
};

const createLoggerTransports = (): winston.transport[] => {
  const transports: winston.transport[] = [new winston.transports.Console()];

  if (isProduction) {
    transports.push(
      new winston.transports.File({
        filename: "logs/error.log",
        level: "error",
      }),
      new winston.transports.File({
        filename: "logs/combined.log",
      }),
    );
  }

  return transports;
};

export const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: createLoggerFormat(),
  transports: createLoggerTransports(),
});
