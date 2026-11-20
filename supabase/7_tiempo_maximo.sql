-- =============================================================
-- PASO 6 — Tiempo máximo para el cruce desde la página
-- Supabase corta las consultas a los ~8 segundos para usuarios logueados.
-- El cruce con meses de historia puede tardar más: se amplía a 2 minutos.
-- =============================================================
alter role authenticated set statement_timeout = '120s';
notify pgrst, 'reload config';
