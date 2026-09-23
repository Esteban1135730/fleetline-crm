-- CreateEnum
CREATE TYPE "ArchiveVisibility" AS ENUM ('PUBLIC', 'RESTRICTED', 'CONFIDENTIAL');

-- AlterTable
ALTER TABLE "ArchiveDocument" ADD COLUMN "visibility" "ArchiveVisibility" NOT NULL DEFAULT 'RESTRICTED';

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_visibility_idx" ON "ArchiveDocument"("organizationId", "visibility");
