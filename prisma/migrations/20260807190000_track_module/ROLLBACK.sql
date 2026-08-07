-- Desfaz a migration 20260807190000_track_module.
-- A migration é puramente aditiva (10 tabelas novas + 3 colunas novas),
-- então o rollback não perde nenhum dado pré-existente: só descarta o que
-- o próprio Track gravou.
--
-- Uso: psql "$DIRECT_URL" -f ROLLBACK.sql
-- Depois: DELETE FROM "_prisma_migrations" WHERE migration_name = '20260807190000_track_module';

BEGIN;

-- Ordem importa por causa das foreign keys (filhos primeiro).
DROP TABLE IF EXISTS "TrackDispatch";
DROP TABLE IF EXISTS "TrackEvent";
DROP TABLE IF EXISTS "TrackMessage";
DROP TABLE IF EXISTS "TrackConversation";
DROP TABLE IF EXISTS "TrackClick";
DROP TABLE IF EXISTS "TrackLink";
DROP TABLE IF EXISTS "TrackConversionTarget";
DROP TABLE IF EXISTS "TrackSettings";
DROP TABLE IF EXISTS "WhatsappLabel";
DROP TABLE IF EXISTS "WhatsappInstance";

ALTER TABLE "Workspace"   DROP COLUMN IF EXISTS "showTrack";
ALTER TABLE "Integration" DROP COLUMN IF EXISTS "loginCustomerId";
ALTER TABLE "Integration" DROP COLUMN IF EXISTS "conversionCustomerId";

-- O índice abaixo NÃO é criado por esta migration: ele já existia no banco
-- desde a migration de soft delete e só passou a ser declarado no schema.
-- Não dropar.
--   Workspace_deletedAt_idx

COMMIT;
