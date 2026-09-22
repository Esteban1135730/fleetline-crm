-- CreateTable
CREATE TABLE "QaSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "userEmail" TEXT,
    "userName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "routeCount" INTEGER NOT NULL DEFAULT 0,
    "actionCount" INTEGER NOT NULL DEFAULT 0,
    "modulesTouched" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "QaSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "path" TEXT,
    "method" TEXT,
    "moduleKey" TEXT,
    "meta" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QaSession_userEmail_startedAt_idx" ON "QaSession"("userEmail", "startedAt");

-- CreateIndex
CREATE INDEX "QaSession_organizationId_startedAt_idx" ON "QaSession"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "QaSession_lastSeenAt_idx" ON "QaSession"("lastSeenAt");

-- CreateIndex
CREATE INDEX "QaEvent_sessionId_createdAt_idx" ON "QaEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "QaEvent_kind_createdAt_idx" ON "QaEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "QaEvent_moduleKey_createdAt_idx" ON "QaEvent"("moduleKey", "createdAt");

-- CreateIndex
CREATE INDEX "QaEvent_path_createdAt_idx" ON "QaEvent"("path", "createdAt");

-- AddForeignKey
ALTER TABLE "QaEvent" ADD CONSTRAINT "QaEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
