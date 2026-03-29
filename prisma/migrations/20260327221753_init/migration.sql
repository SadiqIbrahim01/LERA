-- CreateEnum
CREATE TYPE "Role" AS ENUM ('citizen', 'responder');

-- CreateEnum
CREATE TYPE "ResponderType" AS ENUM ('police', 'ambulance', 'fire');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('online', 'offline', 'busy');

-- CreateEnum
CREATE TYPE "EmergencyType" AS ENUM ('injury', 'fire', 'medical', 'other');

-- CreateEnum
CREATE TYPE "EmergencyStatus" AS ENUM ('pending', 'dispatched', 'resolved', 'cancelled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'citizen',
    "fcmToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ResponderType" NOT NULL,
    "certificationId" TEXT NOT NULL,
    "availability" "Availability" NOT NULL DEFAULT 'offline',
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "ResponderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Emergency" (
    "id" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "responderId" TEXT,
    "type" "EmergencyType" NOT NULL,
    "status" "EmergencyStatus" NOT NULL DEFAULT 'pending',
    "district" TEXT,
    "incidentLat" DOUBLE PRECISION NOT NULL,
    "incidentLng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Emergency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emergencyId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ResponderProfile_userId_key" ON "ResponderProfile"("userId");

-- AddForeignKey
ALTER TABLE "ResponderProfile" ADD CONSTRAINT "ResponderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emergency" ADD CONSTRAINT "Emergency_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emergency" ADD CONSTRAINT "Emergency_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_emergencyId_fkey" FOREIGN KEY ("emergencyId") REFERENCES "Emergency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
