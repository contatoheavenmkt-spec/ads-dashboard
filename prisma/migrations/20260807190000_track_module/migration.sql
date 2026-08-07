-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "conversionCustomerId" TEXT,
ADD COLUMN     "loginCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "showTrack" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WhatsappInstance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Principal',
    "phone" TEXT,
    "state" TEXT NOT NULL DEFAULT 'close',
    "desiredState" TEXT NOT NULL DEFAULT 'off',
    "qr" TEXT,
    "pairingCode" TEXT,
    "qrExpiresAt" TIMESTAMP(3),
    "isBusiness" BOOLEAN NOT NULL DEFAULT false,
    "lastConnectedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappLabel" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "waLabelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" INTEGER,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instanceId" TEXT,
    "destinationPhone" TEXT NOT NULL,
    "messageTemplate" TEXT NOT NULL DEFAULT 'Olá! Vim pelo anúncio. Código {code}',
    "fallbackUrl" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'google',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackClick" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "gclid" TEXT,
    "wbraid" TEXT,
    "gbraid" TEXT,
    "fbclid" TEXT,
    "ctwaClid" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "campaignId" TEXT,
    "adGroupId" TEXT,
    "creativeId" TEXT,
    "keyword" TEXT,
    "device" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "contactKey" TEXT NOT NULL,
    "lidKey" TEXT,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "contactName" TEXT,
    "clickId" TEXT,
    "matchType" TEXT NOT NULL DEFAULT 'none',
    "matchConfidence" TEXT NOT NULL DEFAULT 'none',
    "source" TEXT NOT NULL DEFAULT 'organic',
    "gclid" TEXT,
    "ctwaClid" TEXT,
    "campaignId" TEXT,
    "adId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'lead',
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "inboundCount" INTEGER NOT NULL DEFAULT 0,
    "outboundCount" INTEGER NOT NULL DEFAULT 0,
    "respondedAt" TIMESTAMP(3),
    "qualifiedAt" TIMESTAMP(3),
    "qualifiedBy" TEXT,
    "saleAt" TIMESTAMP(3),
    "saleValue" DOUBLE PRECISION,
    "saleBy" TEXT,
    "lostAt" TIMESTAMP(3),
    "labelsJson" TEXT,
    "leadId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "waMessageId" TEXT,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "isAdReply" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "source" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackConversionTarget" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT,
    "loginCustomerId" TEXT,
    "conversionActionId" TEXT,
    "conversionActionName" TEXT,
    "sendValue" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" DOUBLE PRECISION,
    "datasetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackConversionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackDispatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "notBeforeAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "requestPayload" TEXT,
    "responsePayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "respondedMinInbound" INTEGER NOT NULL DEFAULT 2,
    "respondedRequiresOutbound" BOOLEAN NOT NULL DEFAULT true,
    "qualifiedLabelIds" TEXT,
    "qualifiedPhrases" TEXT,
    "saleLabelIds" TEXT,
    "salePhrases" TEXT,
    "lostLabelIds" TEXT,
    "defaultSaleValue" DOUBLE PRECISION,
    "syncCrmSale" BOOLEAN NOT NULL DEFAULT true,
    "createLeadInCrm" BOOLEAN NOT NULL DEFAULT true,
    "storeMessageText" BOOLEAN NOT NULL DEFAULT true,
    "messageRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "journeyResetDays" INTEGER NOT NULL DEFAULT 30,
    "matchWindowMinutes" INTEGER NOT NULL DEFAULT 30,
    "uploadLagHours" INTEGER NOT NULL DEFAULT 3,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappInstance_workspaceId_idx" ON "WhatsappInstance"("workspaceId");

-- CreateIndex
CREATE INDEX "WhatsappInstance_desiredState_state_idx" ON "WhatsappInstance"("desiredState", "state");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappLabel_instanceId_waLabelId_key" ON "WhatsappLabel"("instanceId", "waLabelId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackLink_slug_key" ON "TrackLink"("slug");

-- CreateIndex
CREATE INDEX "TrackLink_workspaceId_active_idx" ON "TrackLink"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "TrackClick_workspaceId_createdAt_idx" ON "TrackClick"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "TrackClick_workspaceId_matchedAt_idx" ON "TrackClick"("workspaceId", "matchedAt");

-- CreateIndex
CREATE INDEX "TrackClick_linkId_createdAt_idx" ON "TrackClick"("linkId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackClick_workspaceId_code_key" ON "TrackClick"("workspaceId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TrackConversation_leadId_key" ON "TrackConversation"("leadId");

-- CreateIndex
CREATE INDEX "TrackConversation_workspaceId_stage_idx" ON "TrackConversation"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "TrackConversation_workspaceId_firstMessageAt_idx" ON "TrackConversation"("workspaceId", "firstMessageAt");

-- CreateIndex
CREATE INDEX "TrackConversation_workspaceId_campaignId_idx" ON "TrackConversation"("workspaceId", "campaignId");

-- CreateIndex
CREATE INDEX "TrackConversation_clickId_idx" ON "TrackConversation"("clickId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackConversation_instanceId_contactKey_cycle_key" ON "TrackConversation"("instanceId", "contactKey", "cycle");

-- CreateIndex
CREATE INDEX "TrackMessage_conversationId_sentAt_idx" ON "TrackMessage"("conversationId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackMessage_conversationId_waMessageId_key" ON "TrackMessage"("conversationId", "waMessageId");

-- CreateIndex
CREATE INDEX "TrackEvent_workspaceId_stage_occurredAt_idx" ON "TrackEvent"("workspaceId", "stage", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackEvent_conversationId_stage_key" ON "TrackEvent"("conversationId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "TrackConversionTarget_workspaceId_stage_platform_key" ON "TrackConversionTarget"("workspaceId", "stage", "platform");

-- CreateIndex
CREATE INDEX "TrackDispatch_status_nextAttemptAt_idx" ON "TrackDispatch"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "TrackDispatch_workspaceId_createdAt_idx" ON "TrackDispatch"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackDispatch_eventId_targetId_key" ON "TrackDispatch"("eventId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackSettings_workspaceId_key" ON "TrackSettings"("workspaceId");

-- AddForeignKey
ALTER TABLE "WhatsappInstance" ADD CONSTRAINT "WhatsappInstance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappLabel" ADD CONSTRAINT "WhatsappLabel_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsappInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackLink" ADD CONSTRAINT "TrackLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackClick" ADD CONSTRAINT "TrackClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TrackLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackConversation" ADD CONSTRAINT "TrackConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackConversation" ADD CONSTRAINT "TrackConversation_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsappInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackConversation" ADD CONSTRAINT "TrackConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackMessage" ADD CONSTRAINT "TrackMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "TrackConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackEvent" ADD CONSTRAINT "TrackEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "TrackConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackConversionTarget" ADD CONSTRAINT "TrackConversionTarget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackDispatch" ADD CONSTRAINT "TrackDispatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TrackEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackSettings" ADD CONSTRAINT "TrackSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

