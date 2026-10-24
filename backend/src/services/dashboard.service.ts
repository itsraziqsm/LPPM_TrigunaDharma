import { JenisKegiatan, Prisma, RoleName } from "@prisma/client";
import { prisma } from "../config/prisma";

type DashboardStatsParams = {
  tahun?: number;
  jenis?: JenisKegiatan;
};

type ProgramStudiRow = {
  pengusul: {
    programStudi: string | null;
  };
};

type PerStatusItem = {
  status: string;
  count: number;
};

type PerJenisItem = {
  jenis: JenisKegiatan;
  count: number;
};

type PerProdiItem = {
  programStudi: string;
  count: number;
};

type PerTahunItem = {
  tahun: number;
  count: number;
};

type PeriodeAktifItem = {
  id: number;
  nama: string;
  tahun: number;
  jenis: JenisKegiatan;
};

type DashboardStatsResult = {
  totalProposal: number;
  perStatus: PerStatusItem[];
  perJenis: PerJenisItem[];
  perProdi: PerProdiItem[];
  perTahun: PerTahunItem[];
  users: {
    total: number;
    dosen: number;
    reviewer: number;
  };
  periodeAktif: PeriodeAktifItem[];
};

const buildProposalWhere = (
  params?: DashboardStatsParams,
): Prisma.ProposalWhereInput => {
  const { tahun, jenis } = params || {};

  return {
    ...(jenis ? { jenis } : {}),
    ...(tahun ? { periode: { tahun } } : {}),
  };
};

const mapGroupedStatus = (
  rows: Array<{
    status: string;
    _count: { id: number };
  }>,
): PerStatusItem[] => {
  return rows.map((row) => ({
    status: row.status,
    count: row._count.id,
  }));
};

const mapGroupedJenis = (
  rows: Array<{
    jenis: JenisKegiatan;
    _count: { id: number };
  }>,
): PerJenisItem[] => {
  return rows.map((row) => ({
    jenis: row.jenis,
    count: row._count.id,
  }));
};

const aggregatePerProdi = (rows: ProgramStudiRow[]): PerProdiItem[] => {
  const programStudiCountMap: Record<string, number> = {};

  for (const row of rows) {
    const programStudi = row.pengusul.programStudi || "Tidak Diketahui";
    programStudiCountMap[programStudi] =
      (programStudiCountMap[programStudi] || 0) + 1;
  }

  return Object.entries(programStudiCountMap).map(([programStudi, count]) => ({
    programStudi,
    count,
  }));
};

const aggregatePerTahun = (
  rows: Array<{
    createdAt: Date;
    periode: {
      tahun: number;
    } | null;
  }>,
): PerTahunItem[] => {
  const tahunCountMap: Record<number, number> = {};

  for (const row of rows) {
    const tahun = row.periode?.tahun || new Date(row.createdAt).getFullYear();
    tahunCountMap[tahun] = (tahunCountMap[tahun] || 0) + 1;
  }

  return Object.entries(tahunCountMap)
    .map(([tahun, count]) => ({
      tahun: Number(tahun),
      count,
    }))
    .sort((a, b) => a.tahun - b.tahun);
};

const countApprovedUsersByRole = async (
  roleName: RoleName,
): Promise<number> => {
  return prisma.user.count({
    where: {
      status: "approved",
      roles: {
        some: {
          role: {
            name: roleName,
          },
        },
      },
    },
  });
};

const getPerProdiStats = async (
  proposalWhere: Prisma.ProposalWhereInput,
): Promise<PerProdiItem[]> => {
  const rows = await prisma.proposal.findMany({
    where: proposalWhere,
    select: {
      pengusul: {
        select: {
          programStudi: true,
        },
      },
    },
  });

  return aggregatePerProdi(rows);
};

const getPerTahunStats = async (): Promise<PerTahunItem[]> => {
  const rows = await prisma.proposal.findMany({
    select: {
      createdAt: true,
      periode: {
        select: {
          tahun: true,
        },
      },
    },
  });

  return aggregatePerTahun(rows);
};

const getPeriodeAktif = async (): Promise<PeriodeAktifItem[]> => {
  return prisma.periode.findMany({
    where: {
      isAktif: true,
    },
    select: {
      id: true,
      nama: true,
      tahun: true,
      jenis: true,
    },
  });
};

export const dashboardService = {
  async getStats(params?: DashboardStatsParams): Promise<DashboardStatsResult> {
    const proposalWhere = buildProposalWhere(params);

    const [
      totalProposal,
      perStatusRaw,
      perJenisRaw,
      perProdi,
      totalUser,
      totalDosen,
      totalReviewer,
      periodeAktif,
      perTahun,
    ] = await Promise.all([
      prisma.proposal.count({
        where: proposalWhere,
      }),

      prisma.proposal.groupBy({
        by: ["status"],
        where: proposalWhere,
        _count: {
          id: true,
        },
      }),

      prisma.proposal.groupBy({
        by: ["jenis"],
        _count: {
          id: true,
        },
      }),

      getPerProdiStats(proposalWhere),

      prisma.user.count({
        where: {
          status: "approved",
        },
      }),

      countApprovedUsersByRole(RoleName.dosen),

      countApprovedUsersByRole(RoleName.reviewer),

      getPeriodeAktif(),

      getPerTahunStats(),
    ]);

    return {
      totalProposal,
      perStatus: mapGroupedStatus(perStatusRaw),
      perJenis: mapGroupedJenis(perJenisRaw),
      perProdi,
      perTahun,
      users: {
        total: totalUser,
        dosen: totalDosen,
        reviewer: totalReviewer,
      },
      periodeAktif,
    };
  },
};
