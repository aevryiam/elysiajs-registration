import { Elysia, t } from "elysia";
import jwt from "@elysiajs/jwt";
import { hash, verify } from "argon2";
import prisma from "../../db";
import { jwtConfig } from "../../config/jwt";
import { successResponse, errorResponse } from "../../utils/response";
import { authMiddleware } from "../../middlewares";
import {
  signUpSchema,
  signInSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "../../utils/validation";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(jwt(jwtConfig))

  // Sign Up
  .post(
    "/signup",
    async ({ body, jwt, set }) => {
      try {
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { email: body.email },
        });

        if (existingUser) {
          set.status = 400;
          return errorResponse("Email already registered");
        }

        // Hash password
        const hashedPassword = await hash(body.password);

        // Create user
        const user = await prisma.user.create({
          data: {
            email: body.email,
            password: hashedPassword,
            nama: body.nama,
            namaLengkap: body.namaLengkap,
            nomorTelepon: body.nomorTelepon,
          },
          select: {
            id: true,
            email: true,
            nama: true,
            namaLengkap: true,
            nomorTelepon: true,
            role: true,
            isFirstLogin: true,
            createdAt: true,
          },
        });

        // Generate JWT token
        const token = await jwt.sign({
          userId: user.id,
          email: user.email,
          role: user.role,
        });

        return successResponse(
          {
            user,
            token,
          },
          "User registered successfully"
        );
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to register user", error.message);
      }
    },
    {
      body: signUpSchema,
    }
  )

  // Sign In
  .post(
    "/signin",
    async ({ body, jwt, set }) => {
      try {
        // Find user
        const user = await prisma.user.findUnique({
          where: { email: body.email },
        });

        if (!user) {
          set.status = 401;
          return errorResponse("Invalid credentials");
        }

        // Verify password
        const isValidPassword = await verify(user.password, body.password);

        if (!isValidPassword) {
          set.status = 401;
          return errorResponse("Invalid credentials");
        }

        // Generate JWT token
        const token = await jwt.sign({
          userId: user.id,
          email: user.email,
          role: user.role,
        });

        // Return user data without password
        const { password, ...userWithoutPassword } = user;

        return successResponse(
          {
            user: userWithoutPassword,
            token,
          },
          "Login successful"
        );
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to login", error.message);
      }
    },
    {
      body: signInSchema,
    }
  )

  // Get Current User
  .use(authMiddleware)
  .get("/me", async ({ user }: any) => {
    return successResponse(user, "User data retrieved successfully");
  })

  // Update Profile
  .put(
    "/profile",
    async ({ body, user, set }: any) => {
      try {
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: {
            ...body,
            isFirstLogin: false, // Mark as not first login after profile update
          },
          select: {
            id: true,
            email: true,
            nama: true,
            namaLengkap: true,
            nomorTelepon: true,
            photo: true,
            role: true,
            isFirstLogin: true,
            updatedAt: true,
          },
        });

        return successResponse(updatedUser, "Profile updated successfully");
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to update profile", error.message);
      }
    },
    {
      body: updateProfileSchema,
    }
  )

  // Change Password
  .put(
    "/change-password",
    async ({ body, user, set }: any) => {
      try {
        // Get current user with password
        const currentUser = await prisma.user.findUnique({
          where: { id: user.id },
        });

        if (!currentUser) {
          set.status = 404;
          return errorResponse("User not found");
        }

        // Verify old password
        const isValidPassword = await verify(
          currentUser.password,
          body.oldPassword
        );

        if (!isValidPassword) {
          set.status = 401;
          return errorResponse("Invalid old password");
        }

        // Hash new password
        const hashedPassword = await hash(body.newPassword);

        // Update password
        await prisma.user.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        });

        return successResponse(null, "Password changed successfully");
      } catch (error: any) {
        set.status = 500;
        return errorResponse("Failed to change password", error.message);
      }
    },
    {
      body: changePasswordSchema,
    }
  );
