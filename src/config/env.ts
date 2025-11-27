import "dotenv/config";

export const ENV = {
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET:
    process.env.JWT_SECRET,

  // IDRX Config
  IDRX_API_URL: process.env.IDRX_API_URL || "https://idrx.co",
  IDRX_API_KEY: process.env.IDRX_API_KEY || "",
  IDRX_NETWORK_CHAIN_ID: process.env.IDRX_NETWORK_CHAIN_ID || "8453",
  BENDAHARA_WALLET: process.env.BENDAHARA_WALLET || "",

  NODE_ENV: process.env.NODE_ENV || "development",
} as const;
