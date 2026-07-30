-- CreateEnum
CREATE TYPE "CommercialChannel" AS ENUM ('PRIVATE', 'PUBLIC_TENDER');
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED');
CREATE TYPE "PurchaseStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "ProcedureType" AS ENUM ('SOAT', 'TECNOMECANICA', 'TARJETA_OPERACION', 'LICENCIA_TRANSITO', 'REVISION_PREVENTIVA', 'OTHER');

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "contractId" TEXT;

-- CreateTable
CREATE TABLE "TransportContract" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CommercialChannel" NOT NULL DEFAULT 'PRIVATE',
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "route" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "monthlyValue" DECIMAL(14,2),
    "customerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" "PurchaseStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleProcedure" (
    "id" TEXT NOT NULL,
    "type" "ProcedureType" NOT NULL,
    "reference" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'VALID',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "vehicleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleProcedure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParkingLog" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "driverName" TEXT,
    "guardName" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutAt" TIMESTAMP(3),
    "vehicleId" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "ParkingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportContract_organizationId_code_key" ON "TransportContract"("organizationId", "code");
CREATE INDEX "TransportContract_organizationId_status_idx" ON "TransportContract"("organizationId", "status");
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_code_key" ON "PurchaseOrder"("organizationId", "code");
CREATE INDEX "PurchaseOrder_organizationId_status_idx" ON "PurchaseOrder"("organizationId", "status");
CREATE INDEX "VehicleProcedure_organizationId_validTo_idx" ON "VehicleProcedure"("organizationId", "validTo");
CREATE INDEX "VehicleProcedure_vehicleId_type_idx" ON "VehicleProcedure"("vehicleId", "type");
CREATE INDEX "ParkingLog_organizationId_checkInAt_idx" ON "ParkingLog"("organizationId", "checkInAt");
CREATE INDEX "ParkingLog_organizationId_checkOutAt_idx" ON "ParkingLog"("organizationId", "checkOutAt");
CREATE INDEX "Trip_contractId_idx" ON "Trip"("contractId");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "TransportContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransportContract" ADD CONSTRAINT "TransportContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportContract" ADD CONSTRAINT "TransportContract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleProcedure" ADD CONSTRAINT "VehicleProcedure_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleProcedure" ADD CONSTRAINT "VehicleProcedure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParkingLog" ADD CONSTRAINT "ParkingLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ParkingLog" ADD CONSTRAINT "ParkingLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
