create table if not exists leads (
  id               bigint generated always as identity primary key,
  fuente           text not null check (fuente in ('celer','derivado')),
  id_externo       text not null,          -- ID de Celer o Nro Tramite del Derivado
  tramite          text,                   -- Nro de trámite (en Celer: JOB_SEQ)
  fecha            timestamptz,
  nombre           text,
  nombre_tokens    text[] not null default '{}',
  nombre_clave     text,
  dnis             text[] not null default '{}',
  tels             text[] not null default '{}',
  tels8            text[] not null default '{}',
  emails           text[] not null default '{}',
  origen_crudo     text,
  sub_origen_crudo text,
  campana          text,
  sistema          text,
  vendedor         text,
  consulta         text,
  -- de dónde se toma el sub-origen (lo completa resolver_origenes)
  origen_fuente    text,
  origen_valor     text,
  cargado_en       timestamptz not null default now(),
  unique (fuente, id_externo)
);
create index if not exists leads_dnis_idx    on leads using gin (dnis);
create index if not exists leads_tels_idx    on leads using gin (tels);
create index if not exists leads_tels8_idx   on leads using gin (tels8);
create index if not exists leads_emails_idx  on leads using gin (emails);
create index if not exists leads_nombre_idx  on leads (nombre_clave);
create index if not exists leads_tramite_der_idx on leads (tramite) where fuente = 'derivado';
create index if not exists leads_fecha_idx   on leads (fecha);

-- ── 2. PREVENTAS ────────────────────────────────────────────────────
create table if not exists preventas (
  id              bigint generated always as identity primary key,
  pv              text not null,
  fecha           date,
  tipo            text,
  marca           text not null default '',   -- el mismo Nº de PV puede repetirse en otra empresa
  nombre          text,
  nombre_tokens   text[] not null default '{}',
  nombre_clave    text,
  dni             text,
  dni_desde_cuit  boolean not null default false,
  cuit            text,
  tels            text[] not null default '{}',
  tels8           text[] not null default '{}',
  email           text,
  vendedor        text,
  es_empresa      boolean not null default false,
  cargado_en      timestamptz not null default now(),
  unique (marca, pv)
);
create index if not exists preventas_fecha_idx on preventas (fecha);

-- ── 3. VÍNCULOS: qué lead se unió a qué preventa y por qué ─────────
create table if not exists vinculos (
  id            bigint generated always as identity primary key,
  preventa_id   bigint not null references preventas(id) on delete cascade,
  lead_id       bigint not null references leads(id) on delete cascade,
  regla         text not null,     -- dni, cuit, telefono, email, tel8+nombre, tel8, nombre, manual
  nivel         text not null check (nivel in ('seguro','probable','posible')),
  estado        text not null default 'auto' check (estado in ('auto','confirmado','rechazado')),
  es_principal  boolean not null default false,
  creado_en     timestamptz not null default now(),
  revisado_por  text,
  unique (preventa_id, lead_id)
);
create index if not exists vinculos_preventa_idx on vinculos (preventa_id);
create index if not exists vinculos_lead_idx on vinculos (lead_id);

create table if not exists origenes (
  id           bigint generated always as identity primary key,
  fuente       text not null check (fuente in ('celer','derivado')),
  valor_crudo  text not null,     -- Sub Origen (Derivado) o clave_atencion (Celer)
  canal        text not null,     -- agrupador: Facebook, WhatsApp, Darwin, Web...
  sub_origen   text not null,     -- nombre lindo para mostrar
  es_digital   boolean not null default true,
  unique (fuente, valor_crudo)
);

alter table leads     enable row level security;
alter table preventas enable row level security;
alter table vinculos  enable row level security;
alter table origenes  enable row level security;

drop policy if exists solo_logueados on leads;
drop policy if exists solo_logueados on preventas;
drop policy if exists solo_logueados on vinculos;
drop policy if exists solo_logueados on origenes;
create policy solo_logueados on leads     for all to authenticated using (true) with check (true);
create policy solo_logueados on preventas for all to authenticated using (true) with check (true);
create policy solo_logueados on vinculos  for all to authenticated using (true) with check (true);
create policy solo_logueados on origenes  for all to authenticated using (true) with check (true);

