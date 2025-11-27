import { Elysia, t } from "elysia";
import jwt from "@elysiajs/jwt";
import { hash } from "argon2";
import prisma from "../../db";
import { jwtConfig } from "../../config/jwt";
import { successResponse, errorResponse } from "../../utils/response";

const adminSignInSchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String(),
});

const createAdminSchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 8 }),
  nama: t.String({ minLength: 2 }),
});

export const adminAuthRoutes = new Elysia({ prefix: "/admin/auth" })
  .use(jwt(jwtConfig))

  // Admin Sign In
  .post(
    "/signin",
    async ({ body, jwt, set }) => {
      try {
        const admin = await prisma.admin.findUnique({
          where: { email: body.email },
        });

        if (!admin) {
          set.status = 401;
          return errorResponse("Invalid credentials");
        }

        const { verify } = await import("argon2");
        const isValidPassword = await verify(admin.password, body.password);

        if (!isValidPassword) {
          set.status = 401;
          return errorResponse("Invalid credentials");
        }

        const token = await jwt.sign({
          adminId: admin.id,
          email: admin.email,
        });

        const { password, ...adminWithoutPassword } = admin;

        return successResponse(
          {
            admin: adminWithoutPassword,
            token,
          },
          "Admin login successful"
        );
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to login", error.message);
      }
    },
    {
      body: adminSignInSchema,
    }
  )

  // Create Admin (for initial setup - should be protected in production)
  .post(
    "/create",
    async ({ body, set }) => {
      try {
        const existingAdmin = await prisma.admin.findUnique({
          where: { email: body.email },
        });

        if (existingAdmin) {
          set.status = 400;
          return errorResponse("Admin already exists");
        }

        const hashedPassword = await hash(body.password);

        const admin = await prisma.admin.create({
          data: {
            email: body.email,
            password: hashedPassword,
            nama: body.nama,
          },
          select: {
            id: true,
            email: true,
            nama: true,
            createdAt: true,
          },
        });

        return successResponse(admin, "Admin created successfully");
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to create admin", error.message);
      }
    },
    {
      body: createAdminSchema,
    }
  );
