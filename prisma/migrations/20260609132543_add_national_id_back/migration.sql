-- CreateEnum
CREATE TYPE "AssignmentMetric" AS ENUM ('RIDES_COMPLETED', 'EARNINGS', 'ONLINE_HOURS', 'RATING_AVERAGE');

-- CreateEnum
CREATE TYPE "AssignmentRewardType" AS ENUM ('WALLET_CREDIT', 'RATING_BOOST', 'COMMISSION_DISCOUNT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DeletionStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'NATIONAL_ID_BACK';

-- DropForeignKey
ALTER TABLE "Vehicle" DROP CONSTRAINT "Vehicle_typeId_fkey";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "canConfigureDispatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dispatchRadiusKm" DECIMAL(10,2) NOT NULL DEFAULT 3.0,
ADD COLUMN     "resendExpansionKm" DECIMAL(10,2) NOT NULL DEFAULT 2.0;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "nationalIdBackImage" TEXT,
ADD COLUMN     "shiftLockClearedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HourlyRide" ADD COLUMN     "basePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "idleSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLat" DECIMAL(10,8),
ADD COLUMN     "lastLng" DECIMAL(11,8),
ADD COLUMN     "lastSampleAt" TIMESTAMP(3),
ADD COLUMN     "movingKm" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "movingThresholdKmh" DECIMAL(5,2) NOT NULL DEFAULT 5.0,
ADD COLUMN     "pricePerKm" DECIMAL(8,2),
ADD COLUMN     "runningTotal" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "refreshToken" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ALTER COLUMN "typeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VehicleType" ADD COLUMN     "hourlyPricePerKm" DECIMAL(8,2),
ADD COLUMN     "hourlyRate" DECIMAL(10,2),
ADD COLUMN     "supportsHourly" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleFr" TEXT,
    "titleEn" TEXT,
    "descriptionAr" TEXT,
    "descriptionFr" TEXT,
    "descriptionEn" TEXT,
    "metric" "AssignmentMetric" NOT NULL,
    "targetValue" DECIMAL(12,2) NOT NULL,
    "rewardType" "AssignmentRewardType" NOT NULL DEFAULT 'WALLET_CREDIT',
    "rewardAmount" DECIMAL(12,2) NOT NULL,
    "rewardDescriptionAr" TEXT,
    "rewardDescriptionFr" TEXT,
    "rewardDescriptionEn" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "driverIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cityFilter" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverAssignmentProgress" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "currentValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverAssignmentProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "cityId" TEXT NOT NULL,
    "category" TEXT,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "reason" TEXT,
    "status" "DeletionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_status_startsAt_endsAt_idx" ON "Assignment"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "DriverAssignmentProgress_driverId_isCompleted_idx" ON "DriverAssignmentProgress"("driverId", "isCompleted");

-- CreateIndex
CREATE UNIQUE INDEX "DriverAssignmentProgress_assignmentId_driverId_key" ON "DriverAssignmentProgress"("assignmentId", "driverId");

-- CreateIndex
CREATE INDEX "Place_cityId_idx" ON "Place"("cityId");

-- CreateIndex
CREATE INDEX "Place_isActive_idx" ON "Place"("isActive");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_phoneNumber_idx" ON "AccountDeletionRequest"("phoneNumber");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_status_idx" ON "AccountDeletionRequest"("status");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "VehicleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAssignmentProgress" ADD CONSTRAINT "DriverAssignmentProgress_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAssignmentProgress" ADD CONSTRAINT "DriverAssignmentProgress_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
