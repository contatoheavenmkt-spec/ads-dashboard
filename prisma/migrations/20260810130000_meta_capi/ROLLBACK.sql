-- Desfaz 20260810130000_meta_capi (aditiva).
BEGIN;
ALTER TABLE "TrackConversionTarget" DROP COLUMN IF EXISTS "eventName";
ALTER TABLE "TrackConversionTarget" DROP COLUMN IF EXISTS "apiToken";
COMMIT;
