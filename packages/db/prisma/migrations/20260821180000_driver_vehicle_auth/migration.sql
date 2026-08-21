-- Matriz N:N conductor ↔ vehículo (autorización operativa / roster)
CREATE TABLE IF NOT EXISTS "DriverVehicleAuth" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverVehicleAuth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DriverVehicleAuth_organizationId_driverId_vehicleId_key"
  ON "DriverVehicleAuth"("organizationId", "driverId", "vehicleId");

CREATE INDEX IF NOT EXISTS "DriverVehicleAuth_organizationId_active_idx"
  ON "DriverVehicleAuth"("organizationId", "active");

CREATE INDEX IF NOT EXISTS "DriverVehicleAuth_driverId_active_idx"
  ON "DriverVehicleAuth"("driverId", "active");

CREATE INDEX IF NOT EXISTS "DriverVehicleAuth_vehicleId_active_idx"
  ON "DriverVehicleAuth"("vehicleId", "active");

ALTER TABLE "DriverVehicleAuth"
  ADD CONSTRAINT "DriverVehicleAuth_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriverVehicleAuth"
  ADD CONSTRAINT "DriverVehicleAuth_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriverVehicleAuth"
  ADD CONSTRAINT "DriverVehicleAuth_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
