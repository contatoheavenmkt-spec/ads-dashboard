-- Desfaz 20260807210000_track_braid_e_telefone (puramente aditiva).
BEGIN;
ALTER TABLE "TrackConversation" DROP COLUMN IF EXISTS "wbraid";
ALTER TABLE "TrackConversation" DROP COLUMN IF EXISTS "gbraid";
ALTER TABLE "TrackConversation" DROP COLUMN IF EXISTS "contactPhone";
COMMIT;
