import { Elysia, t } from "elysia";
import { cron } from "@elysiajs/cron";
import prisma from "../../db";
import { authMiddleware, adminMiddleware } from "../../middlewares";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
} from "../../utils/response";
import { ENV } from "../../config/env";
import { IDRXClient } from "../../libs/idrx-client";

const createPaymentSchema = t.Object({
  teamId: t.String(),
  amount: t.Number({ minimum: 20000, maximum: 1000000000 }), // IDRX limits
  expiryPeriod: t.Optional(t.Number({ minimum: 1, maximum: 24 })), // Hours
  productDetails: t.Optional(t.String({ maxLength: 255 })),
});

export const transactionsRoutes = new Elysia({ prefix: "/transactions" })
  .use(authMiddleware)

  // Get available payment methods from IDRX
  .get("/payment-methods", async ({ set }) => {
    try {
      const idrxClient = new IDRXClient();
      const methods = await idrxClient.getPaymentMethods();

      return successResponse(
        methods.data,
        "Payment methods retrieved successfully"
      );
    } catch (error: any) {
      console.error("Get payment methods error:", error);
      set.status = 500;
      return errorResponse("Failed to get payment methods", error.message);
    }
  })

  // Create Payment
  .post(
    "/create",
    async ({ body, user, set }: any) => {
      try {
        // Verify team exists and user is the leader
        const team = await prisma.team.findUnique({
          where: { id: body.teamId },
          include: {
            ketua: true,
            transactions: {
              where: {
                status: { in: ["PENDING", "PROCESSING", "COMPLETED"] },
              },
            },
          },
        });

        if (!team) {
          set.status = 404;
          return errorResponse("Team not found");
        }

        if (team.ketuaId !== user.id) {
          set.status = 403;
          return errorResponse(
            "You are not authorized to create payment for this team"
          );
        }

        // Check if team already has active payment
        if (team.transactions.length > 0) {
          set.status = 400;
          return errorResponse("Team already has an active payment");
        }

        // Generate merchant order ID
        const merchantOrderId = `${Date.now()}`;

        // Initialize IDRX client
        const idrxClient = new IDRXClient();

        // Create IDRX mint request
        const idrxResponse = await idrxClient.createMintRequest({
          toBeMinted: body.amount.toString(),
          destinationWalletAddress: ENV.BENDAHARA_WALLET,
          networkChainId: ENV.IDRX_NETWORK_CHAIN_ID,
          expiryPeriod: body.expiryPeriod || 24,
          requestType: "idrx",
          productDetails:
            body.productDetails || `Payment for team: ${team.namaTim}`,
          customerDetail: {
            firstName: team.ketua.nama || "User",
            lastName: "",
            email: team.ketua.email,
          },
        });

        // Calculate expiry timestamp
        const expiryHours = body.expiryPeriod || 24;
        const expiredAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

        // Create payment record
        const payment = await prisma.payment.create({
          data: {
            teamId: body.teamId,
            amount: body.amount, // Use original amount (no fees)
            paymentMethod: "IDRX",
            status: "PENDING",
            externalId: idrxResponse.data.reference, // Duitku reference
            merchantOrderId: idrxResponse.data.merchantOrderId, // IDRX order ID
            expiredAt,
            walletAddress: ENV.BENDAHARA_WALLET,
          },
        });

        return successResponse(
          {
            payment: {
              id: payment.id,
              amount: payment.amount,
              status: payment.status,
              externalId: payment.externalId,
              expiredAt: payment.expiredAt,
            },
            paymentUrl: idrxResponse.data.paymentUrl,
            merchantOrderId: idrxResponse.data.merchantOrderId,
            reference: idrxResponse.data.reference,
          },
          "Payment created successfully. Please complete payment within the expiry period."
        );
      } catch (error: any) {
        console.error("Create payment error:", error);
        set.status = 500;
        return errorResponse("Failed to create payment", error.message);
      }
    },
    {
      body: createPaymentSchema,
    }
  )

  // Get Payment by ID
  .get("/:id", async ({ params, user, set }: any) => {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: params.id },
        include: {
          team: {
            include: {
              ketua: {
                select: {
                  id: true,
                  email: true,
                  nama: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        set.status = 404;
        return errorResponse("Payment not found");
      }

      // Check authorization
      if (payment.team.ketuaId !== user.id) {
        set.status = 403;
        return errorResponse("You are not authorized to view this payment");
      }

      return successResponse(payment, "Payment retrieved successfully");
    } catch (error: any) {
      set.status = 500;
      return errorResponse("Failed to fetch payment", error.message);
    }
  })

  // Get Team Payments
  .get("/team/:teamId", async ({ params, user, set }: any) => {
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
        return errorResponse(
          "You are not authorized to view payments for this team"
        );
      }

      const payments = await prisma.payment.findMany({
        where: { teamId: params.teamId },
        orderBy: { createdAt: "desc" },
      });

      return successResponse(payments, "Payments retrieved successfully");
    } catch (error: any) {
      set.status = 500;
      return errorResponse("Failed to fetch payments", error.message);
    }
  })

  // Webhook endpoint for payment gateway callback
  .post("/webhook/payment", async ({ body, headers, set }: any) => {
    try {
      // TODO: In production, verify webhook signature for security
      // Example signature verification:
      // const signature = headers['x-duitku-signature'] || headers['idrx-signature'];
      // const expectedSignature = crypto.createHmac('sha256', ENV.IDRX_API_KEY)
      //   .update(JSON.stringify(body))
      //   .digest('hex');
      // if (signature !== expectedSignature) {
      //   set.status = 401;
      //   return errorResponse("Invalid webhook signature");
      // }

      console.log("📥 Webhook received:", JSON.stringify(body, null, 2));

      const { reference, status, paidAt } = body;

      if (!reference) {
        set.status = 400;
        return errorResponse("Missing reference in webhook data");
      }

      const payment = await prisma.payment.findFirst({
        where: { externalId: reference },
      });

      if (!payment) {
        set.status = 404;
        return errorResponse("Payment not found");
      }

      // Map IDRX payment status to our status
      let paymentStatus: any = "PENDING";
      if (status === "PAID") {
        paymentStatus = "PROCESSING"; // Will check if minted via cron
      } else if (status === "EXPIRED") {
        paymentStatus = "EXPIRED";
      } else if (status === "FAILED") {
        paymentStatus = "FAILED";
      }

      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: paymentStatus,
          paidAt: paidAt ? new Date(paidAt) : null,
        },
      });

      console.log(
        `✅ Webhook processed: Payment ${payment.id} → ${paymentStatus}`
      );

      return successResponse(
        { paymentId: updatedPayment.id, status: paymentStatus },
        "Webhook processed successfully"
      );
    } catch (error: any) {
      console.error("❌ Webhook error:", error);
      set.status = 500;
      return errorResponse("Failed to process webhook", error.message);
    }
  })

  // Admin - Get All Payments
  .use(adminMiddleware)
  .get("/admin/all", async ({ query }: any) => {
    try {
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "10");
      const skip = (page - 1) * limit;
      const status = query.status;

      const where = status ? { status } : {};

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: {
            team: {
              include: {
                ketua: {
                  select: {
                    id: true,
                    email: true,
                    nama: true,
                  },
                },
              },
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.payment.count({ where }),
      ]);

      return paginatedResponse(payments, page, limit, total);
    } catch (error: any) {
      return errorResponse("Failed to fetch payments", error.message);
    }
  })

  // Admin - Manually verify payment
  .put("/admin/:id/verify", async ({ params, set }: any) => {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: params.id },
      });

      if (!payment) {
        set.status = 404;
        return errorResponse("Payment not found");
      }

      // Update payment status
      const updatedPayment = await prisma.payment.update({
        where: { id: params.id },
        data: {
          status: "COMPLETED",
          paidAt: new Date(),
        },
      });

      // Update team payment status
      await prisma.team.update({
        where: { id: payment.teamId },
        data: { sudahBayar: true },
      });

      return successResponse(updatedPayment, "Payment verified successfully");
    } catch (error: any) {
      set.status = 500;
      return errorResponse("Failed to verify payment", error.message);
    }
  });

// Cron job to check pending payments and verify minting status
export const paymentCronJob = cron({
  name: "payment-checker",
  pattern: "*/10 * * * *", // Every 10 minutes
  run: async () => {
    console.log("Checking pending payments and minting status...");

    try {
      const idrxClient = new IDRXClient();

      // Get all pending/processing payments
      const pendingPayments = await prisma.payment.findMany({
        where: {
          status: { in: ["PENDING", "PROCESSING"] },
          merchantOrderId: { not: null }, // Use merchantOrderId for IDRX API
        },
      });

      console.log(
        `📋 Found ${pendingPayments.length} pending/processing payments`
      );

      for (const payment of pendingPayments) {
        try {
          console.log(`\n🔄 Checking payment ${payment.id}`);
          console.log(`   Merchant Order ID: ${payment.merchantOrderId}`);
          console.log(`   Duitku Reference: ${payment.externalId}`);
          console.log(`   Current Status: ${payment.status}`);
          console.log(`   Created: ${payment.createdAt.toISOString()}`);

          // Check transaction status from IDRX using merchantOrderId
          const transaction = await idrxClient.checkTransactionStatus(
            payment.merchantOrderId!
          );

          if (!transaction) {
            // Calculate time since creation
            const minutesSinceCreation = Math.floor(
              (Date.now() - payment.createdAt.getTime()) / 1000 / 60
            );
            console.log(`⏱️  Payment age: ${minutesSinceCreation} minutes`);

            // Only log warning if payment is older than 15 minutes
            if (minutesSinceCreation > 15) {
              console.log(
                `⚠️  Warning: Transaction not found in IDRX API after ${minutesSinceCreation} minutes`
              );
            } else {
              console.log(`ℹ️  Transaction may still be syncing with IDRX API`);
            }
            continue;
          }

          // Update payment status based on IDRX status
          console.log(
            `📊 IDRX Status: Payment=${transaction.paymentStatus}, Mint=${transaction.userMintStatus}`
          );

          if (transaction.paymentStatus === "PAID") {
            // Check if IDRX has been minted
            if (transaction.userMintStatus === "MINTED" && transaction.txHash) {
              // Payment completed and IDRX minted
              await prisma.payment.update({
                where: { id: payment.id },
                data: {
                  status: "COMPLETED",
                  paidAt: new Date(transaction.updatedAt),
                  mintingTxHash: transaction.txHash,
                },
              });

              // Update team payment status
              await prisma.team.update({
                where: { id: payment.teamId },
                data: { sudahBayar: true },
              });

              console.log(`✅ Payment ${payment.id} COMPLETED!`);
              console.log(`   💎 IDRX Minted - TxHash: ${transaction.txHash}`);
              console.log(`   🏆 Team payment status updated`);
            } else if (transaction.userMintStatus === "PROCESSING") {
              // Still processing
              if (payment.status !== "PROCESSING") {
                await prisma.payment.update({
                  where: { id: payment.id },
                  data: {
                    status: "PROCESSING",
                    paidAt: new Date(transaction.updatedAt),
                  },
                });
              }
              console.log(
                `⏳ Payment ${payment.id} is being processed for minting`
              );
              console.log(`   (This can take 5-15 minutes during peak hours)`);
            } else if (transaction.userMintStatus === "FAILED") {
              // Minting failed
              await prisma.payment.update({
                where: { id: payment.id },
                data: {
                  status: "FAILED",
                },
              });
              console.log(`❌ Payment ${payment.id} minting FAILED`);
            } else {
              console.log(
                `ℹ️  Payment ${payment.id} paid but mint status: ${transaction.userMintStatus}`
              );
            }
          } else if (transaction.paymentStatus === "EXPIRED") {
            // Payment expired
            await prisma.payment.update({
              where: { id: payment.id },
              data: { status: "EXPIRED" },
            });
            console.log(`⏰ Payment ${payment.id} EXPIRED`);
          } else if (transaction.paymentStatus === "WAITING_FOR_PAYMENT") {
            console.log(`⏳ Payment ${payment.id} still waiting for payment`);
          }
        } catch (error: any) {
          console.error(`Error checking payment ${payment.id}:`, error.message);
        }
      }

      console.log("Payment check completed");
    } catch (error) {
      console.error("Error in payment cron job:", error);
    }
  },
});
