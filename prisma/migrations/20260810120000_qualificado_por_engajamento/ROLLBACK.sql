-- Desfaz 20260810120000_qualificado_por_engajamento (aditiva).
BEGIN;
ALTER TABLE "TrackSettings" DROP COLUMN IF EXISTS "qualifiedMinTrocas";
COMMIT;
