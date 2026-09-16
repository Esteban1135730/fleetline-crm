-- Alta unificada RRHH: expediente + usuario + datos de contratación
-- Idempotente: hireDate/phone/email ya existen desde modules_and_roles.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "contractType" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "hireDate" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "eps" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "arl" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "pensionFund" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "compensationFund" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankAccountType" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "emergencyContactRelation" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "terminationReason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_userId_key" ON "Employee"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Employee_userId_fkey'
  ) THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
