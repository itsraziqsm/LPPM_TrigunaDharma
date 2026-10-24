import { Response } from "express";
import { z } from "zod";
import { reviewerService } from "../services/reviewer.service";
import { sendSuccess } from "../utils/response";
import { AuthRequest } from "../types";

const proposalIdParamSchema = z.object({
  proposalId: z.coerce.number().int().positive(),
});

const hapusTugasanParamSchema = z.object({
  proposalId: z.coerce.number().int().positive(),
  reviewerId: z.coerce.number().int().positive(),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});

const tugaskanBodySchema = z.object({
  reviewerIds: z.array(z.coerce.number().int().positive()),
});

function parseProposalIdParam(params: unknown) {
  return proposalIdParamSchema.parse(params);
}

function parseHapusTugasanParams(params: unknown) {
  return hapusTugasanParamSchema.parse(params);
}

function parsePaginationQuery(query: unknown) {
  return paginationQuerySchema.parse(query);
}

function parseTugaskanBody(body: unknown) {
  return tugaskanBodySchema.parse(body);
}

export const reviewerController = {
  async tugaskan(req: AuthRequest, res: Response) {
    const { proposalId } = parseProposalIdParam(req.params);
    const { reviewerIds } = parseTugaskanBody(req.body);

    const result = await reviewerService.tugaskan(
      proposalId,
      reviewerIds,
      req.user!.userId,
    );

    return sendSuccess(res, "Reviewer ditugaskan", result);
  },

  async hapusTugasan(req: AuthRequest, res: Response) {
    const { proposalId, reviewerId } = parseHapusTugasanParams(req.params);

    await reviewerService.hapusTugasan(
      proposalId,
      reviewerId,
      req.user!.userId,
    );

    return sendSuccess(res, "Tugasan reviewer dihapus");
  },

  async submitReview(req: AuthRequest, res: Response) {
    const { proposalId } = parseProposalIdParam(req.params);

    const result = await reviewerService.submitReview(
      proposalId,
      req.user!.userId,
      req.body,
    );

    return sendSuccess(res, "Review disimpan", result);
  },

  async finalizeReview(req: AuthRequest, res: Response) {
    const { proposalId } = parseProposalIdParam(req.params);

    const result = await reviewerService.finalizeReview(
      proposalId,
      req.user!.userId,
    );

    return sendSuccess(res, "Review diselesaikan", result);
  },

  async getMyTugasan(req: AuthRequest, res: Response) {
    const { page, limit } = parsePaginationQuery(req.query);

    const result = await reviewerService.getMyTugasan(req.user!.userId, {
      page,
      limit,
    });

    return sendSuccess(res, "Tugasan review fetched", result.tugasan, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  },

  async getReviewsByProposal(req: AuthRequest, res: Response) {
    const { proposalId } = parseProposalIdParam(req.params);

    const result = await reviewerService.getReviewsByProposal(proposalId);

    return sendSuccess(res, "Reviews fetched", result);
  },
};
