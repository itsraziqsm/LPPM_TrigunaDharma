import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { sendError } from "../utils/response";

type RequestSource = "body" | "query" | "params";

const getRequestSegment = (req: Request, source: RequestSource) => {
  return req[source];
};

export const validate =
  (schema: ZodSchema, source: RequestSource = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const payload = getRequestSegment(req, source);
    const validationResult = schema.safeParse(payload);

    if (!validationResult.success) {
      return sendError(
        res,
        "Validation error",
        422,
        validationResult.error.flatten().fieldErrors,
      );
    }

    req[source] = validationResult.data;
    return next();
  };
