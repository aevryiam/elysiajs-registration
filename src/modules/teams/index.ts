import { Elysia, t } from "elysia";
import prisma from "../../db";
import { authMiddleware, adminMiddleware } from "../../middlewares";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
} from "../../utils/response";

// Validation schemas
const createTeamSchema = t.Object({
  namaTim: t.String({ minLength: 3 }),
  jenisLomba: t.Union([
    t.Literal("KOMPETITIF"),
    t.Literal("NON_KOMPETITIF"),
    t.Literal("WORKSHOP"),
    t.Literal("SEMINAR"),
  ]),
});

const addMemberSchema = t.Object({
  nama: t.String({ minLength: 2 }),
  email: t.String({ format: "email" }),
  nomorTelepon: t.String(),
  tanggalLahir: t.String(), // ISO date string
  jenjangPendidikan: t.Union([
    t.Literal("SD"),
    t.Literal("SMP"),
    t.Literal("SMA"),
    t.Literal("SMK"),
    t.Literal("D3"),
    t.Literal("S1"),
    t.Literal("S2"),
    t.Literal("S3"),
    t.Literal("UMUM"),
  ]),
  asalInstansi: t.String({ minLength: 2 }),
  isKetua: t.Boolean(),
});

const updateTeamSchema = t.Object({
  namaTim: t.Optional(t.String({ minLength: 3 })),
  jenisLomba: t.Optional(
    t.Union([
      t.Literal("KOMPETITIF"),
      t.Literal("NON_KOMPETITIF"),
      t.Literal("WORKSHOP"),
      t.Literal("SEMINAR"),
    ])
  ),
});

export const teamsRoutes = new Elysia({ prefix: "/teams" })
  .use(authMiddleware)

  // Create Team
  .post(
    "/",
    async ({ body, user, set }: any) => {
      try {
        const team = await prisma.team.create({
          data: {
            namaTim: body.namaTim,
            jenisLomba: body.jenisLomba,
            ketuaId: user.id,
          },
          include: {
            ketua: {
              select: {
                id: true,
                email: true,
                nama: true,
                namaLengkap: true,
              },
            },
            members: true,
          },
        });

        return successResponse(team, "Team created successfully");
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to create team", error.message);
      }
    },
    {
      body: createTeamSchema,
    }
  )

  // Get My Teams
  .get("/my-teams", async ({ user, query }: any) => {
    try {
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "10");
      const skip = (page - 1) * limit;

      const [teams, total] = await Promise.all([
        prisma.team.findMany({
          where: { ketuaId: user.id },
          include: {
            ketua: {
              select: {
                id: true,
                email: true,
                nama: true,
                namaLengkap: true,
              },
            },
            members: true,
            transactions: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.team.count({ where: { ketuaId: user.id } }),
      ]);

      return paginatedResponse(teams, page, limit, total);
    } catch (error: any) {
      return errorResponse("Failed to fetch teams", error.message);
    }
  })

  // Get Team by ID
  .get("/:teamId", async ({ params, user, set }: any) => {
    try {
      const team = await prisma.team.findUnique({
        where: { id: params.teamId },
        include: {
          ketua: {
            select: {
              id: true,
              email: true,
              nama: true,
              namaLengkap: true,
              nomorTelepon: true,
            },
          },
          members: true,
          transactions: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!team) {
        set.status = 404;
        return errorResponse("Team not found");
      }

      // Check if user is the team leader
      if (team.ketuaId !== user.id) {
        set.status = 403;
        return errorResponse("You are not authorized to view this team");
      }

      return successResponse(team, "Team retrieved successfully");
    } catch (error: any) {
      set.status = 500;
      return errorResponse("Failed to fetch team", error.message);
    }
  })

  // Update Team
  .put(
    "/:teamId",
    async ({ params, body, user, set }: any) => {
      try {
        // Check if team exists and user is the leader
        const existingTeam = await prisma.team.findUnique({
          where: { id: params.teamId },
        });

        if (!existingTeam) {
          set.status = 404;
          return errorResponse("Team not found");
        }

        if (existingTeam.ketuaId !== user.id) {
          set.status = 403;
          return errorResponse("You are not authorized to update this team");
        }

        // Don't allow update if already verified
        if (existingTeam.statusVerifikasi === "VERIFIED") {
          set.status = 400;
          return errorResponse("Cannot update verified team");
        }

        const updatedTeam = await prisma.team.update({
          where: { id: params.teamId },
          data: body,
          include: {
            ketua: {
              select: {
                id: true,
                email: true,
                nama: true,
                namaLengkap: true,
              },
            },
            members: true,
          },
        });

        return successResponse(updatedTeam, "Team updated successfully");
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to update team", error.message);
      }
    },
    {
      body: updateTeamSchema,
    }
  )

  // Delete Team
  .delete("/:teamId", async ({ params, user, set }: any) => {
    try {
      const team = await prisma.team.findUnique({
        where: { id: params.teamId },
      });

      if (!team) {
        set.status = 404;
        return errorResponse("Team not found");
      }

      if (team.ketuaId !== user.id) {
        set.status = 403;
        return errorResponse("You are not authorized to delete this team");
      }

      // Don't allow deletion if already paid or verified
      if (team.sudahBayar || team.statusVerifikasi === "VERIFIED") {
        set.status = 400;
        return errorResponse("Cannot delete paid or verified team");
      }

      await prisma.team.delete({
        where: { id: params.teamId },
      });

      return successResponse(null, "Team deleted successfully");
    } catch (error: any) {
      set.status = 500;
      return errorResponse("Failed to delete team", error.message);
    }
  })

  // Add Team Member
  .post(
    "/:teamId/members",
    async ({ params, body, user, set }: any) => {
      try {
        const team = await prisma.team.findUnique({
          where: { id: params.teamId },
          include: { members: true },
        });

        if (!team) {
          set.status = 404;
          return errorResponse("Team not found");
        }

        if (team.ketuaId !== user.id) {
          set.status = 403;
          return errorResponse(
            "You are not authorized to add members to this team"
          );
        }

        // Check if member already exists
        const existingMember = team.members.find(
          (m: any) => m.email === body.email
        );

        if (existingMember) {
          set.status = 400;
          return errorResponse(
            "Member with this email already exists in the team"
          );
        }

        const member = await prisma.teamMember.create({
          data: {
            ...body,
            tanggalLahir: new Date(body.tanggalLahir),
            teamId: params.teamId,
          },
        });

        return successResponse(member, "Member added successfully");
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to add member", error.message);
      }
    },
    {
      body: addMemberSchema,
    }
  )

  // Update Team Member
  .put(
    "/:teamId/members/:memberId",
    async ({ params, body, user, set }: any) => {
      try {
        const team = await prisma.team.findUnique({
          where: { id: params.teamId },
        });

        if (!team) {
          set.status = 404;
          return errorResponse("Team not found");
        }

        if (team.ketuaId !== user.id) {
          set.status = 403;
          return errorResponse("You are not authorized to update members");
        }

        const updatedMember = await prisma.teamMember.update({
          where: { id: params.memberId },
          data: {
            ...body,
            tanggalLahir: body.tanggalLahir
              ? new Date(body.tanggalLahir)
              : undefined,
          },
        });

        return successResponse(updatedMember, "Member updated successfully");
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to update member", error.message);
      }
    },
    {
      body: t.Partial(addMemberSchema),
    }
  )

  // Delete Team Member
  .delete("/:teamId/members/:memberId", async ({ params, user, set }: any) => {
    try {
      const team = await prisma.team.findUnique({
        where: { id: params.teamId },
      });

      if (!team) {
        set.status = 404;
        return errorResponse("Team not found");
      }

      if (team.ketuaId !== user.id) {
        set.status = 403;
        return errorResponse("You are not authorized to delete members");
      }

      await prisma.teamMember.delete({
        where: { id: params.memberId },
      });

      return successResponse(null, "Member removed successfully");
    } catch (error: any) {
      set.status = 500;
      return errorResponse("Failed to remove member", error.message);
    }
  })

  // Admin Routes - Get All Teams
  .use(adminMiddleware)
  .get("/admin/all", async ({ query }: any) => {
    try {
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "10");
      const skip = (page - 1) * limit;
      const status = query.status; // PENDING, VERIFIED, REJECTED

      const where = status ? { statusVerifikasi: status } : {};

      const [teams, total] = await Promise.all([
        prisma.team.findMany({
          where,
          include: {
            ketua: {
              select: {
                id: true,
                email: true,
                nama: true,
                namaLengkap: true,
                nomorTelepon: true,
              },
            },
            members: true,
            transactions: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.team.count({ where }),
      ]);

      return paginatedResponse(teams, page, limit, total);
    } catch (error: any) {
      return errorResponse("Failed to fetch teams", error.message);
    }
  })

  // Admin - Verify/Reject Team
  .put(
    "/admin/:teamId/verify",
    async ({ params, body, set }: any) => {
      try {
        const team = await prisma.team.findUnique({
          where: { id: params.teamId },
        });

        if (!team) {
          set.status = 404;
          return errorResponse("Team not found");
        }

        const updatedTeam = await prisma.team.update({
          where: { id: params.teamId },
          data: {
            statusVerifikasi: body.status, // VERIFIED or REJECTED
          },
          include: {
            ketua: true,
            members: true,
          },
        });

        return successResponse(
          updatedTeam,
          `Team ${body.status.toLowerCase()} successfully`
        );
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to verify team", error.message);
      }
    },
    {
      body: t.Object({
        status: t.Union([t.Literal("VERIFIED"), t.Literal("REJECTED")]),
      }),
    }
  );
