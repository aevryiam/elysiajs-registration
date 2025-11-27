import { Elysia } from "elysia";
import jwt from "@elysiajs/jwt";
import { jwtConfig } from "../config/jwt";
import prisma from "../db";
import { errorResponse } from "../utils/response";

export const authMiddleware = new Elysia({ name: "auth" })
  .use(jwt(jwtConfig))
  .derive({ as: "scoped" }, async ({ jwt, headers, set }) => {
    const authHeader = headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      set.status = 401;
      throw new Error("Unauthorized - No token provided");
    }

    const token = authHeader.split(" ")[1];
    const payload = await jwt.verify(token);

    if (!payload) {
      set.status = 401;
      throw new Error("Unauthorized - Invalid token");
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: (payload as any).userId as string },
      select: {
        id: true,
        email: true,
        nama: true,
        role: true,
        isFirstLogin: true,
      },
    });

    if (!user) {
      set.status = 401;
      throw new Error("Unauthorized - User not found");
    }

    return { user };
  })
  .onError(({ code, error, set }) => {
    if (set.status === 401) {
      const message =
        error instanceof Error ? error.message : "Authentication failed";
      return errorResponse(message);
    }
  });
