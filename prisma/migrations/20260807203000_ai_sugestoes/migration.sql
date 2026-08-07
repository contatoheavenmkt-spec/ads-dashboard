-- CreateTable
CREATE TABLE "AiPolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "targetCpa" DOUBLE PRECISION,
    "targetRoas" DOUBLE PRECISION,
    "maxBudgetChangePct" INTEGER NOT NULL DEFAULT 20,
    "maxDailyBudgetCeiling" DOUBLE PRECISION,
    "maxAppliedPerDay" INTEGER NOT NULL DEFAULT 5,
    "minConversionsForCpa" INTEGER NOT NULL DEFAULT 10,
    "lookbackDays" INTEGER NOT NULL DEFAULT 14,
    "disabledRules" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRecommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "policyId" TEXT,
    "adAccountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'google',
    "ruleCode" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "severity" TEXT NOT NULL DEFAULT 'media',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "scope" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "campaignId" TEXT,
    "adGroupId" TEXT,
    "titulo" TEXT NOT NULL,
    "porque" TEXT NOT NULL,
    "evidencia" TEXT NOT NULL,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "impactoEstimado" DOUBLE PRECISION,
    "dedupeKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revisadaPorUserId" TEXT,
    "revisadaEm" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRecommendationAction" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "service" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "resourceName" TEXT,
    "payload" TEXT NOT NULL,
    "updateMask" TEXT,
    "valorAnterior" TEXT,
    "resourceAplicado" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',

    CONSTRAINT "AiRecommendationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiActionLog" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'user',
    "evento" TEXT NOT NULL,
    "requestBody" TEXT,
    "responseBody" TEXT,
    "httpStatus" INTEGER,
    "googleRequestId" TEXT,
    "erroCodigo" TEXT,
    "erroMensagem" TEXT,
    "duracaoMs" INTEGER,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRuleRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "runDate" TEXT NOT NULL,
    "regrasAvaliadas" INTEGER NOT NULL DEFAULT 0,
    "geradas" INTEGER NOT NULL DEFAULT 0,
    "erros" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AiRuleRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiPolicy_workspaceId_key" ON "AiPolicy"("workspaceId");

-- CreateIndex
CREATE INDEX "AiRecommendation_workspaceId_status_idx" ON "AiRecommendation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AiRecommendation_workspaceId_createdAt_idx" ON "AiRecommendation"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRecommendation_status_expiresAt_idx" ON "AiRecommendation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiRecommendation_workspaceId_dedupeKey_key" ON "AiRecommendation"("workspaceId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AiRecommendationAction_recommendationId_idx" ON "AiRecommendationAction"("recommendationId");

-- CreateIndex
CREATE INDEX "AiActionLog_workspaceId_createdAt_idx" ON "AiActionLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AiActionLog_recommendationId_idx" ON "AiActionLog"("recommendationId");

-- CreateIndex
CREATE INDEX "AiRuleRun_workspaceId_idx" ON "AiRuleRun"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRuleRun_workspaceId_adAccountId_runDate_key" ON "AiRuleRun"("workspaceId", "adAccountId", "runDate");

-- AddForeignKey
ALTER TABLE "AiPolicy" ADD CONSTRAINT "AiPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRecommendation" ADD CONSTRAINT "AiRecommendation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AiPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRecommendationAction" ADD CONSTRAINT "AiRecommendationAction_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "AiRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiActionLog" ADD CONSTRAINT "AiActionLog_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "AiRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

