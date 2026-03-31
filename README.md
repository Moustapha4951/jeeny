# Jeeny Backend API

Complete NestJS backend for the Jeeny taxi platform (Mauritanian ride-hailing service).

## 🚀 Features Implemented

### Phase 1: Infrastructure
- ✅ NestJS with TypeScript (strict mode)
- ✅ Prisma ORM with PostgreSQL (Neon)
- ✅ Redis with geospatial operations (Upstash)
- ✅ Firebase Admin SDK for push notifications
- ✅ Environment validation

### Phase 2: Authentication & Authorization
- ✅ OTP authentication via SMS
- ✅ JWT with refresh tokens
- ✅ Session management with device tracking
- ✅ Role-based access control (RBAC)
- ✅ Rate limiting (5 OTP requests/hour)

### Phase 3: User Management
- ✅ User profiles (Consumer, Driver, Admin)
- ✅ Driver registration & approval workflow
- ✅ Driver location tracking (Redis geospatial)
- ✅ Saved places management
- ✅ Audit logging

### Phase 5: Rides Module
- ✅ Fare calculation with surge pricing
- ✅ Driver matching engine with ranking
- ✅ Complete ride lifecycle (pending → accepted → arrived → in-progress → completed)
- ✅ Cancellation policies with fees
- ✅ Scheduled rides support

### Phase 6: Payments & Wallet
- ✅ Wallet system with atomic transactions
- ✅ Payment processing (Wallet, Cash, Card)
- ✅ Mauritanian payment gateways (Bankily, Sedad, Masrvi)
- ✅ Webhook handlers with idempotency
- ✅ Driver payout system
- ✅ Refund processing

## 🛠️ Tech Stack

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL (Neon)
- **Cache**: Redis (Upstash)
- **ORM**: Prisma
- **Authentication**: JWT + OTP
- **Push Notifications**: Firebase Cloud Messaging
- **Payment Gateways**: Bankily, Sedad, Masrvi
- **Maps**: Google Maps API
- **Video Calls**: Agora

## 📦 Installation

```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Run database migrations
npx prisma migrate deploy
```

## 🔧 Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://..."

# Redis
REDIS_URL="redis://..."

# Firebase
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""

# Google Maps
GOOGLE_MAPS_API_KEY=""

# JWT
JWT_SECRET=""

# Server
NODE_ENV="production"
PORT=3000

# Agora (Voice/Video Calls)
AGORA_APP_ID=""
AGORA_APP_CERTIFICATE=""

# Payment Gateways
BANKILY_API_KEY=""
BANKILY_API_URL=""
SEDAD_API_KEY=""
SEDAD_API_URL=""
MASRVI_API_KEY=""
MASRVI_API_URL=""
```

## 🚀 Running the Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## 📡 API Endpoints

### Authentication
- `POST /auth/send-otp` - Send OTP to phone number
- `POST /auth/verify-otp` - Verify OTP and login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout current session

### Users
- `GET /users/profile` - Get user profile
- `PUT /users/profile` - Update profile
- `GET /users/saved-places` - Get saved places
- `POST /users/saved-places` - Add saved place

### Drivers
- `PUT /drivers/online-status` - Toggle online/offline
- `POST /drivers/location` - Update location
- `GET /drivers/nearby` - Find nearby drivers
- `GET /drivers/stats` - Get driver statistics

### Rides
- `POST /rides/estimate` - Estimate fare
- `POST /rides` - Create ride request
- `GET /rides` - Get user rides
- `POST /rides/accept` - Accept ride (driver)
- `POST /rides/:id/arrive` - Mark arrived at pickup
- `POST /rides/:id/start` - Start ride
- `POST /rides/:id/complete` - Complete ride
- `POST /rides/:id/cancel` - Cancel ride

### Wallet
- `GET /wallet/balance` - Get wallet balance
- `GET /wallet/transactions` - Get transaction history
- `POST /wallet/topup` - Top up wallet

### Payments
- `GET /payments` - Get payment history
- `POST /payments/initiate` - Initiate payment
- `POST /payments/:id/refund` - Refund payment (admin)

### Admin
- `GET /admin/drivers/pending` - Get pending driver approvals
- `POST /admin/drivers/approve` - Approve driver
- `POST /admin/drivers/reject` - Reject driver
- `POST /admin/drivers/suspend` - Suspend driver

## 🏗️ Architecture

```
src/
├── config/              # Configuration files
├── common/              # Shared utilities
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   └── interceptors/
├── firebase/            # Firebase service
├── redis/               # Redis service
├── prisma/              # Prisma service
├── modules/
│   ├── auth/           # Authentication
│   ├── users/          # User management
│   ├── rides/          # Ride management
│   ├── payments/       # Payment processing
│   ├── wallet/         # Wallet management
│   ├── admin/          # Admin operations
│   └── ...
└── main.ts
```

## 🔐 Security Features

- JWT authentication with refresh tokens
- OTP rate limiting (5 requests/hour)
- Session management with device tracking
- Role-based access control
- Input validation and sanitization
- Webhook signature verification
- Atomic wallet transactions

## 📊 Database Schema

The database includes 60+ models covering:
- Users (Consumer, Driver, Admin, Employee)
- Rides and ride lifecycle
- Payments and wallet transactions
- Driver locations and tracking
- Ratings and reviews
- Support tickets and complaints
- Promotions and referrals
- And more...

## 🚢 Deployment

This backend is configured for deployment on Railway with:
- Neon PostgreSQL database
- Upstash Redis
- Automatic deployments from GitHub

## 📝 License

Proprietary - Jeeny Platform

## 👥 Team

Developed for the Jeeny taxi platform in Mauritania.
