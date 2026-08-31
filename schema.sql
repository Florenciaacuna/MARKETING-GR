-- =============================================
-- MARKETING DASHBOARD - GRUPO RANDAZZO
-- Ejecutar en Supabase SQL Editor
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CAMPAÑAS
CREATE TABLE IF NOT EXISTS mkt_campanas (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  codigo      TEXT,
  nombre      TEXT NOT NULL,
  marca       TEXT DEFAULT 'TODAS',
  canal       TEXT,
  presupuesto NUMERIC(15,2) DEFAULT 0,
  fecha_inicio DATE,
  fecha_fin    DATE,
  activa      BOOLEAN DEFAULT true,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- GASTOS POR CAMPAÑA
CREATE TABLE IF NOT EXISTS mkt_gastos (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  campana_id  UUID REFERENCES mkt_campanas(id) ON DELETE CASCADE,
  concepto    TEXT,
  monto       NUMERIC(15,2) NOT NULL DEFAULT 0,
  fecha       DATE DEFAULT CURRENT_DATE,
  proveedor   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- LEADS (Celer Facilitadores + Autodealer Derivado)
CREATE TABLE IF NOT EXISTS mkt_leads (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nro_tramite     TEXT,
  fecha_consulta  TIMESTAMPTZ,
  apellido        TEXT,
  nombre          TEXT,
  dni             TEXT,
  telefono        TEXT,
  celular         TEXT,
  email           TEXT,
  origen          TEXT,
  sub_origen      TEXT,
  canal           TEXT,
  codigo_campana  TEXT,
  campana_id      UUID REFERENCES mkt_campanas(id),
  vendedor        TEXT,
  marca           TEXT,
  estado          TEXT,
  fuente          TEXT DEFAULT 'celer',
  consulta        TEXT,
  website_name    TEXT,
  entry_method    TEXT,
  fecha_upload    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(nro_tramite, fuente)
);

-- VENTAS (K1 + Autodealer PV Vinculadas)
CREATE TABLE IF NOT EXISTS mkt_ventas (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pv_solicitud      TEXT,
  fecha             DATE,
  tipo              TEXT,
  nombre            TEXT,
  dni               TEXT,
  telefono_personal TEXT,
  celular_personal  TEXT,
  vendedor          TEXT,
  marca             TEXT,
  fuente            TEXT DEFAULT 'k1',
  lead_id           UUID REFERENCES mkt_leads(id),
  campana_id        UUID REFERENCES mkt_campanas(id),
  metodo_match      TEXT,
  margen_total      NUMERIC(15,2),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pv_solicitud, fuente)
);

-- LOG DE CARGAS
CREATE TABLE IF NOT EXISTS mkt_upload_log (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tipo_archivo          TEXT,
  nombre_archivo        TEXT,
  registros_procesados  INTEGER DEFAULT 0,
  registros_nuevos      INTEGER DEFAULT 0,
  errores               INTEGER DEFAULT 0,
  fecha_upload          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- VISTA DE PERFORMANCE POR CAMPAÑA
-- =============================================
CREATE OR REPLACE VIEW mkt_campanas_performance AS
SELECT
  c.id,
  c.codigo,
  c.nombre,
  c.marca,
  c.canal,
  c.presupuesto,
  c.fecha_inicio,
  c.fecha_fin,
  c.activa,
  COALESCE((SELECT SUM(g.monto) FROM mkt_gastos g WHERE g.campana_id = c.id), 0) AS gastos_adicionales,
  c.presupuesto + COALESCE((SELECT SUM(g.monto) FROM mkt_gastos g WHERE g.campana_id = c.id), 0) AS gasto_total,
  (SELECT COUNT(*) FROM mkt_leads l WHERE l.campana_id = c.id) AS total_leads,
  (SELECT COUNT(*) FROM mkt_ventas v WHERE v.campana_id = c.id) AS total_ventas,
  COALESCE((SELECT SUM(v.margen_total) FROM mkt_ventas v WHERE v.campana_id = c.id), 0) AS ingreso_total,
  CASE
    WHEN (SELECT COUNT(*) FROM mkt_ventas v WHERE v.campana_id = c.id) > 0
    THEN ROUND(
      (c.presupuesto + COALESCE((SELECT SUM(g.monto) FROM mkt_gastos g WHERE g.campana_id = c.id), 0))
      / (SELECT COUNT(*) FROM mkt_ventas v WHERE v.campana_id = c.id)
    )
    ELSE 0
  END AS cac,
  CASE
    WHEN (c.presupuesto + COALESCE((SELECT SUM(g.monto) FROM mkt_gastos g WHERE g.campana_id = c.id), 0)) > 0
      AND COALESCE((SELECT SUM(v.margen_total) FROM mkt_ventas v WHERE v.campana_id = c.id), 0) > 0
    THEN ROUND(
      ((COALESCE((SELECT SUM(v.margen_total) FROM mkt_ventas v WHERE v.campana_id = c.id), 0)
        - (c.presupuesto + COALESCE((SELECT SUM(g.monto) FROM mkt_gastos g WHERE g.campana_id = c.id), 0)))
      / (c.presupuesto + COALESCE((SELECT SUM(g.monto) FROM mkt_gastos g WHERE g.campana_id = c.id), 0))) * 100,
    2)
    ELSE NULL
  END AS roi_porcentaje
FROM mkt_campanas c;

-- =============================================
-- VISTA RESUMEN POR CANAL
-- =============================================
CREATE OR REPLACE VIEW mkt_leads_por_canal AS
SELECT
  canal,
  fuente,
  DATE_TRUNC('month', fecha_consulta) AS mes,
  COUNT(*) AS total_leads,
  COUNT(CASE WHEN campana_id IS NOT NULL THEN 1 END) AS leads_atribuidos
FROM mkt_leads
WHERE fecha_consulta IS NOT NULL
GROUP BY canal, fuente, DATE_TRUNC('month', fecha_consulta);

-- =============================================
-- RLS - Habilitar y permitir acceso
-- =============================================
ALTER TABLE mkt_campanas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_gastos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_ventas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_upload_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_campanas"   ON mkt_campanas   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_gastos"     ON mkt_gastos     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_leads"      ON mkt_leads      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ventas"     ON mkt_ventas     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_log"        ON mkt_upload_log FOR ALL USING (true) WITH CHECK (true);
