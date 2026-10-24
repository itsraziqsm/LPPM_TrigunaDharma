import { Response } from "express";
import { z } from "zod";
import { JenisKegiatan, ProposalStatus } from "@prisma/client";
import { proposalDosenService } from "../services/Proposaldosen.service";
import { sendSuccess } from "../utils/response";
import { AuthRequest } from "../types";

const proposalListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
  jenis: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.nativeEnum(JenisKegiatan).optional(),
  ),
  status: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.nativeEnum(ProposalStatus).optional(),
  ),
  search: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
});

const proposalIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const searchMembersQuerySchema = z.object({
  q: z.string().trim().min(2),
});

const respondInvitationBodySchema = z.object({
  status: z.enum(["diterima", "ditolak"]),
});

function parseProposalListQuery(query: unknown) {
  return proposalListQuerySchema.parse(query);
}

function parseProposalIdParam(params: unknown) {
  return proposalIdParamSchema.parse(params);
}

function parseSearchMembersQuery(query: unknown) {
  const parsed = searchMembersQuerySchema.safeParse(query);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

function parseRespondInvitationBody(body: unknown) {
  const parsed = respondInvitationBodySchema.safeParse(body);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export const proposalDosenController = {
  async getMyProposals(req: AuthRequest, res: Response) {
    const { page, limit, jenis, status, search } = parseProposalListQuery(
      req.query,
    );

    const result = await proposalDosenService.findMyProposals(
      req.user!.userId,
      {
        page,
        limit,
        jenis,
        status,
        search,
      },
    );

    return sendSuccess(res, "Proposals fetched", result.proposals, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  },

  async getStats(req: AuthRequest, res: Response) {
    const stats = await proposalDosenService.getStats(req.user!.userId);
    return sendSuccess(res, "Stats fetched", stats);
  },

  async getById(req: AuthRequest, res: Response) {
    const { id } = parseProposalIdParam(req.params);

    const result = await proposalDosenService.findMyProposalById(
      id,
      req.user!.userId,
    );

    return sendSuccess(res, "Proposal fetched", result);
  },

  async create(req: AuthRequest, res: Response) {
    const result = await proposalDosenService.create({
      ...req.body,
      pengusulId: req.user!.userId,
    });

    return sendSuccess(res, "Proposal berhasil dibuat", result, 201);
  },

  async update(req: AuthRequest, res: Response) {
    const { id } = parseProposalIdParam(req.params);

    const result = await proposalDosenService.update(
      id,
      req.user!.userId,
      req.body,
    );

    return sendSuccess(res, "Proposal berhasil diperbarui", result);
  },

  async submit(req: AuthRequest, res: Response) {
    const { id } = parseProposalIdParam(req.params);

    const result = await proposalDosenService.submit(id, req.user!.userId);

    return sendSuccess(res, "Proposal berhasil diajukan", result);
  },

  async delete(req: AuthRequest, res: Response) {
    const { id } = parseProposalIdParam(req.params);

    await proposalDosenService.delete(id, req.user!.userId);
    return sendSuccess(res, "Proposal berhasil dihapus");
  },

  async searchMembers(req: AuthRequest, res: Response) {
    const parsedQuery = parseSearchMembersQuery(req.query);

    if (!parsedQuery) {
      return res.status(400).json({
        success: false,
        message: "Ketik minimal 2 karakter untuk mencari pengguna",
      });
    }

    const users = await proposalDosenService.searchUsers(
      parsedQuery.q,
      req.user!.userId,
    );

    return sendSuccess(res, "Users fetched", users);
  },

  async getMyInvitations(req: AuthRequest, res: Response) {
    const invitations = await proposalDosenService.getMyInvitations(
      req.user!.userId,
    );

    return sendSuccess(res, "Invitations fetched", invitations);
  },

  async respondInvitation(req: AuthRequest, res: Response) {
    const { id } = parseProposalIdParam(req.params);
    const parsedBody = parseRespondInvitationBody(req.body);

    if (!parsedBody) {
      return res
        .status(400)
        .json({ message: "Status harus diterima atau ditolak" });
    }

    const result = await proposalDosenService.respondInvitation(
      id,
      req.user!.userId,
      parsedBody.status,
    );

    return sendSuccess(res, `Undangan berhasil ${parsedBody.status}`, result);
  },
};
