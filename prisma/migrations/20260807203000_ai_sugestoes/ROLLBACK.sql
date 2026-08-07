-- Desfaz a migration 20260807203000_ai_sugestoes.
-- Puramente aditiva (5 tabelas novas, nenhuma coluna em tabela existente),
-- então o rollback não perde nada além do que a própria IA gerou.
--
--   psql "$DIRECT_URL" -f ROLLBACK.sql

BEGIN;

DROP TABLE IF EXISTS "AiActionLog";
DROP TABLE IF EXISTS "AiRecommendationAction";
DROP TABLE IF EXISTS "AiRecommendation";
DROP TABLE IF EXISTS "AiRuleRun";
DROP TABLE IF EXISTS "AiPolicy";

COMMIT;
