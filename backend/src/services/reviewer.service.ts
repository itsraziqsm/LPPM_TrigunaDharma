import { Prisma, ProposalStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { notificationService } from "./notification.service";
import { activityLogService } from "./activityLog.service";

type SubmitReviewInput = {
  nilaiRelevansi?: string;
  nilaiMetodologi?: string;
  nilaiAnggaran?: string;
  nilaiLuaran?: string;
  catatan?: string;
  rekomendasi?: ProposalStatus;
};

type PaginationParams = {
  page: number;
  limit: number;
};

const proposalReviewerAssignmentSelect = {
  id: true,
  judul: true,
  status: true,
  reviewerTugasan: {
    select: {
      id: true,
      reviewer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.ProposalSelect;

const reviewerTaskProposalSelect = {
  id: true,
  judul: true,
  status: true,
  jenis: true,
  pengusul: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ProposalSelect;

const reviewerOwnReviewSelect = {
  id: true,
  proposalId: true,
  nilaiRelevansi: true,
  nilaiMetodologi: true,
  nilaiAnggaran: true,
  nilaiLuaran: true,
  catatan: true,
  rekomendasi: true,
  isDone: true,
} satisfies Prisma.ProposalReviewSelect;

async function getProposalOrThrow(proposalId: number) {
  return prisma.proposal.findUniqueOrThrow({
    where: { id: proposalId },
  });
}

function ensureProposalCanBeAssigned(status: ProposalStatus) {
  const allowedStatuses: ProposalStatus[] = [
    ProposalStatus.diajukan,
    ProposalStatus.review,
  ];

  if (!allowedStatuses.includes(status)) {
    throw new Error(
      "Proposal harus berstatus diajukan atau review untuk ditugaskan reviewer",
    );
  }
}

async function assignReviewersToProposal(
  proposalId: number,
  reviewerIds: number[],
) {
  if (reviewerIds.length === 0) {
    return;
  }

  await prisma.reviewerTugasan.createMany({
    data: reviewerIds.map((reviewerId) => ({
      proposalId,
      reviewerId,
    })),
    skipDuplicates: true,
  });
}

async function markProposalAsInReview(proposalId: number) {
  await prisma.proposal.update({
    where: { id: proposalId },
    data: { status: ProposalStatus.review },
  });
}

async function notifyAssignedReviewers(
  reviewerIds: number[],
  proposalId: number,
  proposalTitle: string,
) {
  if (reviewerIds.length === 0) {
    return;
  }

  await Promise.all(
    reviewerIds.map((reviewerId) =>
      notificationService.create({
        userId: reviewerId,
        type: "reviewer_ditugaskan",
        judul: "Tugas Review Baru",
        pesan: `Anda ditugaskan untuk mereview proposal "${proposalTitle}"`,
        refId: proposalId,
        refType: "proposal",
      }),
    ),
  );
}

async function logReviewerAssignmentActivity(
  ketuaUserId: number,
  proposalId: number,
  proposalTitle: string,
) {
  await activityLogService.log({
    userId: ketuaUserId,
    action: "reviewer.tugaskan",
    entityType: "proposal",
    entityId: proposalId,
    proposalId,
    detail: `Reviewer ditugaskan ke proposal "${proposalTitle}"`,
  });
}

async function getAssignedProposalSummary(proposalId: number) {
  return prisma.proposal.findUnique({
    where: { id: proposalId },
    select: proposalReviewerAssignmentSelect,
  });
}

async function ensureReviewerAssignmentOrThrow(
  proposalId: number,
  reviewerId: number,
) {
  const assignment = await prisma.reviewerTugasan.findUnique({
    where: {
      proposalId_reviewerId: {
        proposalId,
        reviewerId,
      },
    },
  });

  if (!assignment) {
    throw new Error("Anda tidak ditugaskan untuk mereview proposal ini");
  }

  return assignment;
}

function buildPagination(page: number, limit: number) {
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}

function attachReviewerReviewsToTasks<
  T extends {
    proposalId: number;
  },
  R extends {
    proposalId: number;
  },
>(tasks: T[], reviews: R[]) {
  const reviewMap = new Map(
    reviews.map((review) => [review.proposalId, review]),
  );

  return tasks.map((task) => ({
    ...task,
    myReview: reviewMap.get(task.proposalId) ?? null,
  }));
}

export const reviewerService = {
  async tugaskan(
    proposalId: number,
    reviewerIds: number[],
    ketuaUserId: number,
  ) {
    const proposal = await getProposalOrThrow(proposalId);

    ensureProposalCanBeAssigned(proposal.status);

    await assignReviewersToProposal(proposalId, reviewerIds);
    await markProposalAsInReview(proposalId);
    await notifyAssignedReviewers(reviewerIds, proposalId, proposal.judul);
    await logReviewerAssignmentActivity(
      ketuaUserId,
      proposalId,
      proposal.judul,
    );

    return getAssignedProposalSummary(proposalId);
  },

  async hapusTugasan(
    proposalId: number,
    reviewerId: number,
    ketuaUserId: number,
  ) {
    await prisma.reviewerTugasan.deleteMany({
      where: { proposalId, reviewerId },
    });

    await activityLogService.log({
      userId: ketuaUserId,
      action: "reviewer.hapus_tugasan",
      entityType: "proposal",
      entityId: proposalId,
      proposalId,
    });
  },

  async submitReview(
    proposalId: number,
    reviewerId: number,
    data: SubmitReviewInput,
  ) {
    await ensureReviewerAssignmentOrThrow(proposalId, reviewerId);

    const review = await prisma.proposalReview.upsert({
      where: {
        proposalId_reviewerId: {
          proposalId,
          reviewerId,
        },
      },
      update: {
        ...data,
        isDone: false,
      },
      create: {
        proposalId,
        reviewerId,
        ...data,
      },
    });

    await activityLogService.log({
      userId: reviewerId,
      action: "review.submit",
      entityType: "proposal",
      entityId: proposalId,
      proposalId,
      detail: `Review disimpan untuk proposal #${proposalId}`,
    });

    return review;
  },

  async finalizeReview(proposalId: number, reviewerId: number) {
    const review = await prisma.proposalReview.findUniqueOrThrow({
      where: {
        proposalId_reviewerId: {
          proposalId,
          reviewerId,
        },
      },
      include: {
        proposal: true,
      },
    });

    const updatedReview = await prisma.proposalReview.update({
      where: { id: review.id },
      data: { isDone: true },
    });

    await notificationService.create({
      userId: review.proposal.pengusulId,
      type: "review_selesai",
      judul: "Review Selesai",
      pesan: `Proposal "${review.proposal.judul}" telah selesai direview`,
      refId: proposalId,
      refType: "proposal",
    });

    await activityLogService.log({
      userId: reviewerId,
      action: "review.finalize",
      entityType: "proposal",
      entityId: proposalId,
      proposalId,
    });

    return updatedReview;
  },

  async getMyTugasan(reviewerId: number, params: PaginationParams) {
    const { page, limit } = params;
    const { skip, take } = buildPagination(page, limit);

    const [tugasan, total] = await Promise.all([
      prisma.reviewerTugasan.findMany({
        where: { reviewerId },
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          proposal: {
            select: reviewerTaskProposalSelect,
          },
        },
      }),
      prisma.reviewerTugasan.count({
        where: { reviewerId },
      }),
    ]);

    const proposalIds = tugasan.map((item) => item.proposalId);

    const reviews =
      proposalIds.length > 0
        ? await prisma.proposalReview.findMany({
            where: {
              proposalId: { in: proposalIds },
              reviewerId,
            },
            select: reviewerOwnReviewSelect,
          })
        : [];

    const tugasanWithReview = attachReviewerReviewsToTasks(tugasan, reviews);

    return {
      tugasan: tugasanWithReview,
      total,
      page,
      limit,
    };
  },

  async getReviewsByProposal(proposalId: number) {
    return prisma.proposalReview.findMany({
      where: { proposalId },
      include: {
        reviewer: {
          select: {
            id: true,
            name: true,
            fullName: true,
          },
        },
      },
    });
  },
};
