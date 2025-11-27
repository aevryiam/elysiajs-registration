# Competition Registration Backend API

Backend API untuk sistem registrasi lomba dengan fitur team management dan payment gateway integration.

## 🚀 Tech Stack

- **Runtime**: Bun v1.2.15
- **Framework**: Elysia v1.2.7
  - @elysiajs/swagger - API documentation
  - @elysiajs/cors - CORS handling
  - @elysiajs/jwt - JWT authentication
  - @elysiajs/cron - Scheduled jobs
- **ORM**: Prisma 7.0.0
  - @prisma/adapter-pg - PostgreSQL adapter
  - pg - PostgreSQL driver
- **Database**: PostgreSQL (Supabase)
- **Authentication**: JWT + Argon2id
- **Payment**: IDRX Integration (Base Chain ID 8453)
- **Security**: HMAC-SHA256 signature verification

## 📋 Features

### Authentication

- ✅ User Sign Up/Sign In
- ✅ Admin Sign In
- ✅ JWT Token-based authentication
- ✅ Password hashing with Argon2
- ✅ Profile management
- ✅ First login detection

### Team Management

- ✅ Create & manage teams
- ✅ Add/remove team members
- ✅ Team verification by admin
- ✅ Support multiple competition types (KOMPETITIF, NON_KOMPETITIF, WORKSHOP, SEMINAR)

### Payment Gateway

- ✅ Payment creation & tracking
- ✅ IDRX payment gateway integration
- ✅ IDRX token minting on Base chain
- ✅ Automatic payment verification via cron job
- ✅ Webhook support
- ✅ Payment expiration handling

### Admin Dashboard

- ✅ View all teams
- ✅ Verify/reject teams
- ✅ View all payments
- ✅ Manual payment verification

## 📁 Project Structure

```
backend/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── config/
│   │   ├── env.ts            # Environment variables
│   │   └── jwt.ts            # JWT configuration
│   ├── db/
│   │   └── index.ts          # Prisma client
│   ├── middlewares/
│   │   ├── auth.ts           # User authentication
│   │   └── admin.ts          # Admin authentication
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── index.ts      # User auth routes
│   │   │   └── admin.ts      # Admin auth routes
│   │   ├── teams/
│   │   │   └── index.ts      # Team management
│   │   └── transactions/
│   │       └── index.ts      # Payment & transactions
│   ├── utils/
│   │   ├── response.ts       # Response formatters
│   │   └── validation.ts     # Validation schemas
│   └── index.ts              # Main application
├── .env                       # Environment variables
├── package.json
└── tsconfig.json
```

## 🛠️ Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

Update `.env` file with your configurations:

```env
# Database (Supabase) - CRITICAL: Must use connection pooling for Prisma 7
DATABASE_URL= cek env ya dek

# Server
PORT=5000
NODE_ENV=development

# JWT - Use strong secret key (minimum 32 characters)
JWT_SECRET= cek env ya dek

# IDRX Payment Gateway & Token Minting (Base Chain ID 8453)
IDRX_API_URL=https://api-prod.idrx.tech/api/v2
IDRX_API_KEY= cek env ya dek
CHAIN_ID=8453
BENDAHARA_WALLET= cek env ya dek
```

**Important Notes:**

- Use Supabase connection pooling URL (port 6543) for Prisma 7 compatibility
- IDRX uses Base network (Chain ID 8453)
- Webhook URL must be publicly accessible in production

### 3. Database Setup

```bash
# Generate Prisma client
bunx prisma generate

# Run migrations
bunx prisma migrate dev --name init

# (Optional) Open Prisma Studio
bunx prisma studio
```

### 4. Create Admin Account

```bash
# Start the server first
bun dev

# Then create admin via API
curl -X POST http://localhost:3000/admin/auth/create \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123456",
    "nama": "Admin"
  }'
```

### 5. Run Development Server

```bash
bun dev
```

Server will start at `http://localhost:3000`

## 📚 API Documentation

API documentation tersedia di Swagger UI:

```
http://localhost:5000/swagger
```

### Main Endpoints

#### Authentication (User)

- `POST /auth/signup` - Register new user
- `POST /auth/signin` - User login
- `GET /auth/me` - Get current user
- `PUT /auth/profile` - Update profile
- `PUT /auth/change-password` - Change password

#### Authentication (Admin)

- `POST /admin/auth/signin` - Admin login
- `POST /admin/auth/create` - Create admin

#### Teams

- `POST /teams` - Create team
- `GET /teams/my-teams` - Get my teams
- `GET /teams/:id` - Get team detail
- `PUT /teams/:id` - Update team
- `DELETE /teams/:id` - Delete team
- `POST /teams/:id/members` - Add member
- `PUT /teams/:teamId/members/:memberId` - Update member
- `DELETE /teams/:teamId/members/:memberId` - Remove member

#### Teams (Admin)

- `GET /teams/admin/all` - Get all teams
- `PUT /teams/admin/:id/verify` - Verify/reject team

#### Transactions

- `POST /transactions/create` - Create payment
- `GET /transactions/:id` - Get payment detail
- `GET /transactions/team/:teamId` - Get team payments
- `POST /transactions/webhook/payment` - Payment webhook

#### Transactions (Admin)

- `GET /transactions/admin/all` - Get all payments
- `PUT /transactions/admin/:id/verify` - Verify payment manually

## 🗄️ Database Models

### User

- Email, password, nama, nama lengkap
- Nomor telepon, photo (URL)
- Role (USER/ADMIN)
- isFirstLogin flag
- Timestamps

### Admin

- Email, password, nama
- Timestamps

### Team

- Nama tim, jenis lomba
- Status verifikasi (PENDING/VERIFIED/REJECTED)
- sudahBayar flag
- Ketua (User relation)
- Members (TeamMember[])
- Timestamps

### TeamMember

- Nama, email, nomor telepon
- Tanggal lahir
- Jenjang pendidikan
- Asal instansi
- isKetua flag
- Team relation
- Timestamps

### Payment

- Amount, payment method
- Status (PENDING/PROCESSING/COMPLETED/FAILED/EXPIRED)
- External ID (from gateway)
- Minting transaction hash
- Wallet address
- Paid/expired dates
- Team relation
- Timestamps

## ⚙️ Payment Flow

### 1. Payment Creation

```
User (Team Leader)
  ↓ POST /transactions/create
Backend creates Payment (PENDING)
  ↓ Calls IDRX API
IDRX returns payment URL
  ↓ Returns to user
User redirected to IDRX checkout
```

### 2. Payment Processing (2 Jalur)

**Option A: Webhook (Instant - Requires Public URL)**

```
User completes payment at IDRX
  ↓ IDRX webhook callback
POST /transactions/webhook/payment
  ↓ Updates payment
Status: PENDING → PROCESSING
```

**Option B: Cron Job (Every 10 Minutes - Auto Running)**

```
Cron runs every 10 minutes
  ↓ Finds PENDING/PROCESSING payments
Calls IDRX API to check status
  ↓ If paid
Updates to PROCESSING
```

### 3. IDRX Token Minting

```
Payment status: PROCESSING
  ↓ Cron job checks
Calls IDRX API to mint tokens
  ↓ IDRX mints on Base chain
Tokens sent to bendahara wallet
  ↓ Gets transaction hash
Status: PROCESSING → COMPLETED
```

### 4. Final Verification

```
Cron job polls IDRX API
  ↓ Checks userMintStatus
If MINTED (with txHash)
  ↓ Updates database
- Payment status: COMPLETED
- mintingTxHash: 0x...
- Team sudahBayar: true
```

**Key Points:**

- ✅ **Webhook**: Requires public URL, instant update
- ✅ **Cron Job**: Works on localhost, max 10 min delay
- ✅ **Recommended for Development**: Use cron job (already running)
- ⚠️ **Production**: Set webhook URL in IDRX dashboard for instant updates

## 🔄 Cron Jobs

### Payment Checker (Every 10 minutes)

- Checks pending/processing payments
- Verifies payment status with gateway
- Mints IDRX for confirmed payments
- Handles payment expiration

## 🔒 Security

- Password hashing with Argon2id
- JWT-based authentication with secure tokens
- Role-based access control (User/Admin)
- Protected admin endpoints
- Webhook signature verification (to be implemented)
- HMAC-SHA256 for payment gateway signatures

## 🐛 Troubleshooting & Critical Fixes

### Authentication Middleware Pattern

**Problem**: Login endpoint returning `404 NOT_FOUND` instead of proper authentication errors.

**Root Cause**: Incorrect middleware pattern - using `onBeforeHandle` with return values doesn't stop execution in Elysia.

**Solution**: Use `derive({ as: 'scoped' })` with throw Error pattern.

```typescript
// ❌ WRONG - Returns but doesn't stop execution
.onBeforeHandle(({ headers, set, jwt }) => {
  if (!token) {
    set.status = 401;
    return errorResponse("Unauthorized");
  }
})

// ✅ CORRECT - Throws error and stops execution
.derive({ as: 'scoped' }, async ({ headers, jwt }) => {
  if (!token) {
    throw new Error("Unauthorized: Missing token");
  }
  // ... rest of auth logic
  return { user };
})
.onError(({ error, set }) => {
  if (error.message.startsWith("Unauthorized")) {
    set.status = 401;
    return errorResponse(error.message.replace("Unauthorized: ", ""));
  }
})
```

### Prisma 7 Database Connection

**Problem**: `PrismaClientInitializationError` - "Connector error: error creating a database connection"

**Solution**: Use Supabase connection pooling with Prisma adapter:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

**Environment**: Use pooling URL (port 6543) instead of direct connection (port 5432)

### Payment Amount Issues

**Problem**: Payment showing unexpected fees (52500 instead of 50000)

**Solution**: Use original amount from request body, not IDRX response:

```typescript
// ❌ WRONG - IDRX adds fees
const amount = parseFloat(idrxResponse.data.amount);

// ✅ CORRECT - Use original amount
const amount = body.amount;
```

### Common Issues

| Issue                     | Cause                    | Solution                                |
| ------------------------- | ------------------------ | --------------------------------------- |
| 404 on protected routes   | Middleware pattern       | Use `derive({ as: 'scoped' })`          |
| "user.id is undefined"    | Auth context not set     | Check middleware derives user correctly |
| Database connection error | Wrong Prisma version     | Use Prisma 7 with adapter-pg            |
| Payment amount mismatch   | Using IDRX response      | Use request body amount                 |
| Webhook not working       | Localhost not accessible | Use cron job or deploy to public URL    |

## 🚧 Development Status & Production Checklist

### ✅ Completed Features

- [x] Full backend structure with Prisma 7
- [x] User & Admin authentication (JWT + Argon2)
- [x] Team management (CRUD + members)
- [x] IDRX payment gateway integration
- [x] IDRX token minting on Base chain
- [x] Webhook endpoint for payment callbacks
- [x] Cron job for payment status monitoring (every 10 min)
- [x] Authentication middleware (scoped derive pattern)
- [x] Swagger API documentation
- [x] CORS configuration
- [x] Error handling with proper status codes
- [x] Payment flow (create → pay → mint → verify)

### 🔧 Production Requirements

**Critical (Must Have)**

- [ ] Deploy to public server (VPS/Cloud)
- [ ] Configure webhook URL in IDRX/Duitku dashboard
- [ ] Add webhook signature verification for security
- [ ] Set up SSL/TLS certificates (HTTPS)
- [ ] Configure environment variables on server
- [ ] Set up database backups
- [ ] Add rate limiting (prevent abuse)
- [ ] Add request/error logging

**Important (Should Have)**

- [ ] Email notifications (payment success, team verification)
- [ ] File upload for user photos (S3/Cloudinary)
- [ ] Team size validation (min/max members)
- [ ] Payment amount validation per competition type
- [ ] Admin dashboard UI integration
- [ ] Monitoring & alerts (error tracking, uptime)

**Nice to Have (Could Have)**

- [ ] Unit tests (authentication, payments)
- [ ] Integration tests (full payment flow)
- [ ] CI/CD pipeline
- [ ] Performance optimization
- [ ] API versioning
- [ ] GraphQL support

### 📝 Production Setup Notes

1. **Webhook Configuration**:

   ```
   Set in IDRX Dashboard:
   Callback URL: https://your-domain.com/transactions/webhook/payment
   ```

2. **Environment Variables**:

   - Use production DATABASE_URL (Supabase production)
   - Strong JWT_SECRET (64+ characters)
   - Production IDRX_API_KEY
   - Production CHAIN_ID & BENDAHARA_WALLET

3. **Server Requirements**:

   - Node.js/Bun runtime
   - PostgreSQL client
   - SSL certificates
   - Firewall: Allow port 80, 443

4. **Monitoring**:
   - Cron job logs (payment checking)
   - Webhook delivery logs
   - Database connection pool status
   - IDRX API response times

## 📝 License

MIT
