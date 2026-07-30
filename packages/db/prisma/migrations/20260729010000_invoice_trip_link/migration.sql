-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "tripId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "journalEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tripId_key" ON "Invoice"("tripId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
