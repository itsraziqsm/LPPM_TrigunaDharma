import { Response } from "express";
import { ApiResponse } from "../types";

type ApiMeta = ApiResponse["meta"];

export const sendSuccess = <T>(
  res: Response,
  message: string,
  data?: T,
  statusCode: number = 200,
  meta?: ApiMeta,
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta,
  });
};

export const sendError = (
  res: Response,
  message: string,
  statusCode: number = 400,
  errors?: unknown,
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};
