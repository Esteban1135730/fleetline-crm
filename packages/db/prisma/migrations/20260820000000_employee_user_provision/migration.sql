-- Alta unificada RRHH: expediente + usuario + datos de contratación
ALTER TABLE "Employee" ADD COLUMN "userId" TEXT;
ALTER TABLE "Employee" ADD COLUMN "address" TEXT;
ALTER TABLE "Employee" ADD COLUMN "city" TEXT;
ALTER TABLE "Employee" ADD COLUMN "contractType" TEXT;
ALTER TABLE "Employee" ADD COLUMN "hireDate" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "eps" TEXT;
ALTER TABLE "Employee" ADD COLUMN "arl" TEXT;
ALTER TABLE "Employee" ADD COLUMN "pensionFund" TEXT;
ALTER TABLE "Employee" ADD COLUMN "compensationFund" TEXT;
ALTER TABLE "Employee" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Employee" ADD COLUMN "bankAccountType" TEXT;
ALTER TABLE "Employee" ADD COLUMN "bankAccountNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN "emergencyContactName" TEXT;
ALTER TABLE "Employee" ADD COLUMN "emergencyContactPhone" TEXT;
ALTER TABLE "Employee" ADD COLUMN "emergencyContactRelation" TEXT;
ALTER TABLE "Employee" ADD COLUMN "terminatedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN "terminationReason" TEXT;

CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
