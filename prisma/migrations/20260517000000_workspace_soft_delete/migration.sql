-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Index parcial pra acelerar queries que filtram "not deleted" (maioria)
CREATE INDEX "Workspace_deletedAt_idx" ON "Workspace"("deletedAt");
