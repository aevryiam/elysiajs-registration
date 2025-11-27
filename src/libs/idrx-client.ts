import { ENV } from "../config/env";
import crypto from "crypto";

/**
 * IDRX API Client
 * Documentation: https://docs.idrx.co/api/transaction-api
 */

interface IDRXMintRequest {
  toBeMinted: string; // Amount in IDR (min: 20000, max: 1000000000)
  destinationWalletAddress: string; // Bendahara wallet
  networkChainId: string; // e.g., "137" for Polygon
  expiryPeriod: number; // Payment expiry in hours (default: 24)
  requestType?: string; // "idrx" or empty
  productDetails?: string; // Optional note (max 255 chars)
  customerDetail?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface IDRXMintResponse {
  statusCode: number;
  message: string;
  data: {
    id: string;
    merchantCode: string;
    reference: string; // Transaction reference
    paymentUrl: string; // Payment page URL
    amount: string; // Amount after fees
    statusCode: string;
    statusMessage: string;
    merchantOrderId: string;
  };
}

interface IDRXTransactionHistory {
  statusCode: number;
  message: string;
  metadata: {
    page: number | null;
    perPage: number | null;
    pageCount: number | null;
    totalCount: number;
  };
  records: Array<{
    id: number;
    paymentAmount: number;
    merchantOrderId: string;
    productDetails: string;
    customerVaName: string;
    email: string;
    chainId: number;
    destinationWalletAddress: string;
    toBeMinted: string;
    createdAt: string;
    updatedAt: string;
    paymentStatus: "PAID" | "WAITING_FOR_PAYMENT" | "EXPIRED";
    expiryTimestamp: string;
    reference: string;
    txHash: string | null;
    userMintStatus:
      | "NOT_AVAILABLE"
      | "PROCESSING"
      | "MINTED"
      | "FAILED"
      | "REJECTED"
      | "REFUND";
    adminMintStatus: string;
    reportStatus: string;
    requestType: string;
  }>;
}

export class IDRXClient {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = ENV.IDRX_API_URL || "https://idrx.co";
    this.apiKey = ENV.IDRX_API_KEY || "";
  }

  /**
   * Generate IDRX API signature
   * Required headers: idrx-api-key, idrx-api-sig, idrx-api-ts
   */
  private generateSignature(timestamp: string): string {
    // Signature = HMAC-SHA256(timestamp, apiKey)
    const hmac = crypto.createHmac("sha256", this.apiKey);
    hmac.update(timestamp);
    return hmac.digest("hex");
  }

  /**
   * Get common headers for IDRX API
   */
  private getHeaders() {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp);

    return {
      "Content-Type": "application/json",
      "idrx-api-key": this.apiKey,
      "idrx-api-sig": signature,
      "idrx-api-ts": timestamp,
    };
  }

  /**
   * Create IDRX mint request
   * POST /api/transaction/mint-request
   */
  async createMintRequest(params: IDRXMintRequest): Promise<IDRXMintResponse> {
    const url = `${this.apiUrl}/api/transaction/mint-request`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IDRX API Error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Get transaction history
   * GET /api/transaction/user-transaction-history
   */
  async getTransactionHistory(params: {
    transactionType: "MINT" | "BURN" | "BRIDGE" | "DEPOSIT_REDEEM";
    page: number;
    take: number;
    userMintStatus?:
      | "NOT_AVAILABLE"
      | "PROCESSING"
      | "MINTED"
      | "FAILED"
      | "REJECTED"
      | "REFUND";
    paymentStatus?: "PAID" | "WAITING_FOR_PAYMENT" | "EXPIRED";
    merchantOrderId?: string;
  }): Promise<IDRXTransactionHistory> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `${this.apiUrl}/api/transaction/user-transaction-history?${queryParams}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IDRX API Error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Get payment methods
   * GET /api/transaction/method
   */
  async getPaymentMethods(): Promise<any> {
    const url = `${this.apiUrl}/api/transaction/method`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IDRX API Error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Check transaction status by merchant order ID
   */
  async checkTransactionStatus(merchantOrderId: string): Promise<any> {
    try {
      const history = await this.getTransactionHistory({
        transactionType: "MINT",
        page: 1,
        take: 10, // Increase to get more recent transactions
        merchantOrderId,
      });

      console.log(`🔍 Searching for merchantOrderId: ${merchantOrderId}`);
      console.log(`📊 Found ${history.records?.length || 0} records`);

      if (history.records && history.records.length > 0) {
        const record = history.records[0];
        console.log(`✅ Transaction found:`);
        console.log(`   - Payment Status: ${record.paymentStatus}`);
        console.log(`   - Mint Status: ${record.userMintStatus}`);
        console.log(`   - TxHash: ${record.txHash || "N/A"}`);
        return record;
      }

      console.log(
        `⚠️  Transaction not found in IDRX API yet (may need time to sync)`
      );
      return null;
    } catch (error: any) {
      console.error(`❌ Error checking IDRX transaction:`, error.message);
      return null;
    }
  }
}
