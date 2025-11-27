import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { ENV } from "./config/env";
import { authRoutes } from "./modules/auth";
import { adminAuthRoutes } from "./modules/auth/admin";
import { teamsRoutes } from "./modules/teams";
import { transactionsRoutes, paymentCronJob } from "./modules/transactions";
import { successResponse } from "./utils/response";

const app = new Elysia()
  // Global plugins
  .use(cors())
  .use(
    swagger({
      documentation: {
        info: {
          title: "Competition Registration API",
          version: "1.0.0",
          description:
            "Backend API untuk sistem registrasi lomba dengan payment gateway",
        },
        tags: [
          { name: "Auth", description: "Authentication endpoints" },
          { name: "Teams", description: "Team management endpoints" },
          {
            name: "Transactions",
            description: "Payment & transaction endpoints",
          },
        ],
      },
    })
  )

  // Health check
  .get("/", () =>
    successResponse(
      {
        name: "Competition Registration API",
        version: "1.0.0",
        status: "running",
        timestamp: new Date().toISOString(),
      },
      "API is running"
    )
  )

  .get("/health", () =>
    successResponse(
      {
        status: "healthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      "Service is healthy"
    )
  )

  // Register modules
  .use(authRoutes)
  .use(adminAuthRoutes)
  .use(teamsRoutes)
  .use(transactionsRoutes)

  // Initialize cron jobs
  .use(paymentCronJob)

  // Global error handler
  .onError(({ code, error, set }) => {
    console.error("Error:", error);

    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false,
        message: "Validation error",
        errors: error.message,
      };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        success: false,
        message: "Route not found",
      };
    }

    set.status = 500;
    return {
      success: false,
      message: (error && typeof error === 'object' && 'message' in error ? error.message : undefined) || "Internal server error",
    };
  })

  // Start server
  .listen(ENV.PORT);

console.log(
  `🦊 Competition Registration API is running at http://${app.server?.hostname}:${app.server?.port}`
);
console.log(
  `📚 Swagger documentation at http://${app.server?.hostname}:${app.server?.port}/swagger`
);
console.log(`⏰ Payment cron job is active (checks every 10 minutes)`);

export default app;
