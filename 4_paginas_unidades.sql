-- =============================================================
-- PASO 3b — Mejoras del cruce (se corre ENCIMA del paso 3; no borra datos)
-- =============================================================

-- 3b.1 Columnas nuevas
alter table leads     add column if not exists facilitador   text;  -- quien derivó (Celer: USUARIO_DERIVO)
alter table leads     add column if not exists setter        text;  -- Darwin → setter
alter table leads     add column if not exists unidad        text;
alter table leads     add column if not exists pagina_url    text;  -- página de Facebook/Instagram donde hizo clic
alter table leads     add column if not exists anuncio_link  text;  -- link del anuncio si Darwin lo menciona
alter table leads     add column if not exists anuncio_texto text;  -- frase del resumen que describe el anuncio
alter table preventas add column if not exists unidad        text;

-- 3b.2 Páginas de Facebook/Instagram (editable: agregar o renombrar)
create table if not exists paginas (
  url     text primary key,
  pagina  text not null
);
alter table paginas enable row level security;
drop policy if exists solo_logueados on paginas;
create policy solo_logueados on paginas for all to authenticated using (true) with check (true);
insert into paginas (url, pagina) values
 ('https://www.facebook.com/530981103598882','Facebook Grupo Randazzo'),
 ('https://www.facebook.com/389762297751038','Facebook Peara (Fiat)'),
 ('https://www.facebook.com/202686309858477','Facebook Kiara (Chevrolet)'),
 ('https://www.facebook.com/391235007599250','Facebook Ciara (Renault)'),
 ('https://www.facebook.com/977359112123800','Facebook Chery'),
 ('www.gruporandazzo.com','Web Grupo Randazzo'),
 ('https://www.facebook.com/ComunidadGrupoRandazzo/','Facebook Grupo Randazzo'),
 ('https://www.facebook.com/AutosCiara/','Facebook Ciara (Renault)'),
 ('https://www.facebook.com/KiaraAutomotora/','Facebook Kiara (Chevrolet)')
on conflict (url) do nothing;

-- 3b.3 Unidad / team → sucursal (tomado de la planilla de control; editable)
create table if not exists unidades (
  unidad    text primary key,
  sucursal  text not null
);
alter table unidades enable row level security;
drop policy if exists solo_logueados on unidades;
create policy solo_logueados on unidades for all to authenticated using (true) with check (true);
insert into unidades (unidad, sucursal) values
 ('Randazzo Team 0 km y usados','Randazzo'),
 ('Ciara 44 Team Usados y Compras','Ciara'),
 ('Ciara 44 Team Planes','Ciara'),
 ('Kiara 44 Team 0 km','Kiara'),
 ('Kiara 44 Team Planes','Kiara'),
 ('Kiara 44 Team Usados','Kiara'),
 ('Ciara 44 Team 0 km','Ciara'),
 ('Peara Centenario Team Convencional','Peara'),
 ('Peara 44 Team 0 km y usados','Peara'),
 ('Peara 44 Team Planes','Peara'),
 ('Kiara Berazategui Team 0 km','Kiara'),
 ('Berisso team 0km y usados','Berisso'),
 ('Peara Centenario Team Planes','Peara'),
 ('Capital del Usado Team','Predio 143'),
 ('Randazzo Team Planes','Randazzo'),
 ('Centro Compras Salta','SALRA'),
 ('Ciara Centenario Team 0 km','Ciara'),
 ('Kiara Centenario Team 0 km','Kiara'),
 ('Berisso team planes','Berisso'),
 ('Kiara Berazategui Team Planes','Kiara'),
 ('Kiara Centenario Team Usados','Kiara'),
 ('Kiara Centenario Team Planes','Kiara'),
 ('Randazzo Team Usados','Randazzo'),
 ('Kiara Team 0km','Kiara'),
 ('Ventas Especiales','Ventas especiales'),
 ('Centenario Team Usados','Centenario'),
 ('Kiara Team Planes','Kiara'),
 ('Ciara Centenario Team Planes','Ciara'),
 ('Centenario Team Plan de Ahorro','Centenario'),
 ('Peara 44 Team 0km','Peara'),
 ('Centenario Team 0km','Centenario'),
 ('Berisso Team Usados','Berisso'),
 ('Berazategui Team Usados','Berazategui'),
 ('Berazategui Team 0km','Berazategui'),
 ('Randazzo Team 0km','Randazzo'),
 ('Fabrica Usados Compradores','Fábrica'),
 ('Santa Rosa Planes','Kiara La Pampa'),
 ('Ciara 44 team planes','Ciara'),
 ('Centro compras salta','SALRA'),
 ('Kiara 44 team usados','Kiara'),
 ('Capital Usado','Predio 143'),
 ('Gerente','Sin clasificar'),
 ('Fabrica Usados Vendedores','Sin clasificar'),
 ('Planes Centenario','Centenario'),
 ('Berisso Team 0km','Berisso'),
 ('Auditoría','Sin clasificar'),
 ('CENtro Compras Salta','SALRA'),
 ('General Pico Ventas','Kiara La Pampa'),
 ('General Pico 0KM','Kiara La Pampa'),
 ('Ciara centenario Team 0 km','Ciara'),
 ('Peara Centenario','Centenario'),
 ('Peara 44 team planes','Peara 44'),
 ('Santa Rosa 0KM','Kiara La Pampa'),
 ('Tablet Alistamientos','Sin clasificar'),
 ('Usados y Convencional Centenario','Centenario')
on conflict (unidad) do nothing;


-- ── 3.1 Catálogo: origen / grupo / sub-origen, todo editable ───────
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_name = 'origenes' and column_name = 'canal') then
    alter table origenes rename column canal to grupo;
  end if;
end $$;
alter table origenes add column if not exists origen text;
alter table origenes add column if not exists notas  text;

update origenes set origen = case grupo
    when 'Presencial' then 'Presencial'
    when 'Teléfono'   then 'Teléfono'
    when 'Cartera'    then 'Cartera'
    when 'Evento'     then 'Evento'
    else 'Internet' end
 where origen is null;
alter table origenes alter column origen set not null;

update origenes set notas = 'A validar: ¿Setters es Darwin?'
 where fuente = 'celer' and valor_crudo = 'SETTER' and notas is null;
update origenes set notas = 'A validar: ¿qué es Evento y si es digital?'
 where valor_crudo = 'Evento' and notas is null;

-- ── 3.2 Columnas nuevas para las reglas adicionales ────────────────
alter table preventas add column if not exists apellido_tokens text[] not null default '{}';
alter table preventas add column if not exists conyuge         text;
alter table preventas add column if not exists conyuge_clave   text;
alter table preventas add column if not exists email_base      text;
alter table preventas add column if not exists es_interna      boolean not null default false;
alter table leads     add column if not exists emails_base     text[] not null default '{}';
alter table leads     add column if not exists tels7           text[] not null default '{}';
alter table preventas add column if not exists tels7           text[] not null default '{}';
create index if not exists leads_tels7_idx on leads using gin (tels7);
create index if not exists leads_emails_base_idx on leads using gin (emails_base);
create index if not exists leads_vendedor_idx    on leads (lower(vendedor));

-- ── 3.3 Vendedores: usuario del CRM ↔ nombre en la preventa ────────
-- Ej: madosreis ↔ Matias Dos Reis. Se completa solo; se puede corregir a mano.
create table if not exists vendedores (
  usuario  text primary key,           -- como figura en los leads (minúscula)
  nombre   text not null,              -- como figura en la preventa
  origen   text not null default 'auto' check (origen in ('auto','manual'))
);
alter table vendedores enable row level security;
drop policy if exists solo_logueados on vendedores;
create policy solo_logueados on vendedores for all to authenticated using (true) with check (true);

create or replace function mapear_vendedores()
returns void
language sql
set search_path = public
as $$
  with n as (
    select distinct vendedor as nombre,
           regexp_split_to_array(translate(lower(trim(vendedor)), 'áéíóúñü', 'aeiounu'), '\s+') as tk
      from preventas where vendedor is not null
  ),
  c as (  -- usuario posible = 1 a 3 letras del nombre + el resto de las palabras pegadas
    select n.nombre, left(n.tk[1], k) || array_to_string(n.tk[s:array_length(n.tk,1)], '') as cand
      from n, generate_series(1,3) k, generate_series(2, greatest(array_length(n.tk,1),2)) s
     where array_length(n.tk,1) >= 2
  ),
  u as (select distinct lower(vendedor) as usuario from leads where vendedor ~ '^[A-Za-z0-9._]+$')
  insert into vendedores (usuario, nombre, origen)
  select distinct on (u.usuario) u.usuario, c.nombre, 'auto'
    from u join c on c.cand = u.usuario
   order by u.usuario, c.nombre
  on conflict (usuario) do nothing;
$$;

-- ── 3.4 Clasificación de cada lead ─────────────────────────────────
create or replace function resolver_origenes()
returns void
language sql
set search_path = public
as $$
  update leads set origen_fuente = fuente, origen_valor = sub_origen_crudo
   where origen_fuente is null;
  update leads c set origen_fuente = 'derivado', origen_valor = d.sub_origen_crudo
    from leads d
   where c.fuente = 'celer' and c.origen_fuente = 'celer'
     and d.fuente = 'derivado' and d.tramite = c.tramite
     and d.sub_origen_crudo is not null;
  -- y el trámite del Derivado toma de Celer la página, el anuncio y el setter
  update leads d set pagina_url = c.pagina_url, anuncio_link = c.anuncio_link,
                     anuncio_texto = c.anuncio_texto, setter = c.setter
    from leads c
   where d.fuente = 'derivado' and c.fuente = 'celer' and c.tramite = d.tramite
     and d.pagina_url is null and c.pagina_url is not null;
$$;

drop view if exists leads_clasificados cascade;   -- (si existen las vistas del paso 4, hay que volver a correr el paso 4)
create view leads_clasificados with (security_invoker = true) as
select
  l.*,
  coalesce(pg.pagina, l.pagina_url)                   as pagina,
  coalesce(o.origen, case when l.fuente = 'celer' then 'Internet' else l.origen_crudo end) as origen,
  coalesce(o.grupo, 'Sin clasificar')                 as grupo,
  coalesce(o.sub_origen, l.origen_valor, 'Sin dato')  as sub_origen,
  coalesce(o.es_digital, l.fuente = 'celer' or l.origen_crudo = 'Internet') as es_digital
from leads l
left join origenes o on o.fuente = l.origen_fuente and o.valor_crudo = l.origen_valor
left join paginas pg on pg.url = l.pagina_url;

-- ── 3.5 EL CRUCE ────────────────────────────────────────────────────
-- Reglas:
--   SEGURO    dni · cuit (8 del medio) · telefono (10 dígitos) · email
--   PROBABLE  tel8+apellido (últimos 8 del tel + apellido) · vendedor+nombre (mismo vendedor + nombre y apellido)
--   POSIBLE   tel8 (sin apellido) · vendedor+apellido (apellido poco común, 90 días) · nombre completo · conyuge · email parecido
-- Solo leads anteriores a la preventa (+5 días de tolerancia: a veces el trámite se carga después). Reglas de nombre: hasta 180 días antes.
-- Los vínculos confirmados o rechazados a mano no se tocan.
-- Principal: confirmado a mano > último lead digital > último contacto.
create or replace function ejecutar_cruce()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  resultado jsonb;
begin
  analyze leads; analyze preventas; analyze vinculos;
  perform resolver_origenes();
  perform mapear_vendedores();
  delete from vinculos where estado = 'auto';

  -- Teléfonos/emails compartidos por 4+ clientes distintos (centrales de empresas): se ignoran
  create temp table claves_compartidas on commit drop as
    select t as valor from (
      select unnest(tels) t, nombre_clave from preventas
      union all
      select unnest(tels8), nombre_clave from preventas
      union all
      select email, nombre_clave from preventas where email is not null
    ) x group by t having count(distinct coalesce(nombre_clave, t)) >= 4;

  -- Qué tan común es cada palabra de nombre (GARCIA, RODRIGUEZ... son muy comunes)
  create temp table frecuencia_nombres on commit drop as
    select t, count(*) n from leads, unnest(nombre_tokens) t group by t;

  create temp table candidatos on commit drop as
  with p as (select * from preventas where not es_interna),
  c as (
    -- SEGURO
    select p.id pid, l.id lid, case when p.dni_desde_cuit then 'cuit' else 'dni' end regla, 1 rango, false solo_nombre
      from p join leads l on l.dnis @> array[p.dni]
     where p.dni is not null
    union all
    select p.id, l.id, 'telefono', 2, false
      from p cross join lateral unnest(p.tels) t
      join leads l on l.tels @> array[t]
     where length(t) = 10 and t not in (select valor from claves_compartidas)
    union all
    select p.id, l.id, 'email', 3, false
      from p join leads l on l.emails @> array[p.email]
     where p.email is not null and p.email not in (select valor from claves_compartidas)
    -- PROBABLE / POSIBLE por últimos 8 del teléfono
    union all
    select p.id, l.id,
           case when l.nombre_tokens && p.apellido_tokens then 'tel8+apellido' else 'tel8' end,
           case when l.nombre_tokens && p.apellido_tokens then 4 else 6 end, false
      from p cross join lateral unnest(p.tels8) t
      join leads l on l.tels8 @> array[t]
     where t not in (select valor from claves_compartidas)
    -- Teléfono de la preventa SIN característica (7 dígitos): últimos 7 + apellido
    union all
    select p.id, l.id,
           case when l.nombre_tokens && p.apellido_tokens then 'tel7+apellido' else 'tel7' end,
           case when l.nombre_tokens && p.apellido_tokens then 4 else 6 end, false
      from p cross join lateral unnest(p.tels) t
      join leads l on l.tels7 @> array[right(t,7)]
     where length(t) = 7 and t not in (select valor from claves_compartidas)
    -- PROBABLE / POSIBLE por vendedor
    union all
    -- vendedor+apellido solo con apellidos poco comunes (menos de 30 leads) y hasta 90 días antes
    select p.id, l.id,
           case when l.nombre_tokens @> p.nombre_tokens then 'vendedor+nombre' else 'vendedor+apellido' end,
           case when l.nombre_tokens @> p.nombre_tokens then 5 else 7 end, true
      from p join vendedores v on v.nombre = p.vendedor
      join leads l on lower(l.vendedor) = v.usuario and l.nombre_tokens && p.apellido_tokens
     where l.fecha::date >= p.fecha - 90
       and (l.nombre_tokens @> p.nombre_tokens
            or exists (select 1 from unnest(p.apellido_tokens) a
                         join frecuencia_nombres f on f.t = a
                        where a = any(l.nombre_tokens) and f.n < 30))
    -- POSIBLE
    union all
    select p.id, l.id, 'nombre', 8, true
      from p join leads l on l.nombre_clave = p.nombre_clave
     where p.nombre_clave is not null
    union all
    select p.id, l.id, 'conyuge', 9, true
      from p join leads l on l.nombre_clave = p.conyuge_clave
     where p.conyuge_clave is not null
    union all
    select p.id, l.id, 'email parecido', 10, false
      from p join leads l on l.emails_base @> array[p.email_base]
     where p.email_base is not null and not (l.emails @> array[coalesce(p.email,'')])
  )
  select distinct on (c.pid, c.lid) c.pid, c.lid, c.regla,
         case when c.rango <= 3 then 'seguro'
              when c.rango <= 5 then 'probable'
              else 'posible' end as nivel
    from c
    join p on p.id = c.pid
    join leads l on l.id = c.lid
   where l.fecha is null or p.fecha is null
      or (l.fecha::date <= p.fecha + 5
          and (not c.solo_nombre or l.fecha::date >= p.fecha - 180))
   order by c.pid, c.lid, c.rango;

  insert into vinculos (preventa_id, lead_id, regla, nivel)
  select pid, lid, regla, nivel from candidatos
  on conflict (preventa_id, lead_id) do nothing;

  update vinculos set es_principal = false where es_principal;
  with orden as (
    select v.id, row_number() over (
             partition by v.preventa_id
             order by (v.estado = 'confirmado') desc,
                      lc.es_digital desc,
                      lc.fecha desc nulls last) as n
      from vinculos v
      join leads_clasificados lc on lc.id = v.lead_id
     where v.estado <> 'rechazado'
       and (v.estado = 'confirmado' or v.nivel in ('seguro','probable'))
  )
  update vinculos v set es_principal = true from orden o where o.id = v.id and o.n = 1;

  select jsonb_build_object(
    'preventas',          (select count(*) from preventas),
    'internas',           (select count(*) from preventas where es_interna),
    'vinculadas',         (select count(*) from vinculos where es_principal),
    'vinculadas_digital', (select count(*) from vinculos v join leads_clasificados lc on lc.id = v.lead_id
                            where v.es_principal and lc.es_digital),
    'posibles',           (select count(*) from preventas p where not p.es_interna
                            and not exists (select 1 from vinculos v where v.preventa_id = p.id and v.es_principal)
                            and exists (select 1 from vinculos v where v.preventa_id = p.id and v.nivel = 'posible' and v.estado = 'auto')),
    'sin_vinculo',        (select count(*) from preventas p where not p.es_interna
                            and not exists (select 1 from vinculos v where v.preventa_id = p.id and v.estado <> 'rechazado'))
  ) into resultado;
  return resultado;
end $$;

-- Solo usuarios con sesión pueden ejecutar estas funciones
revoke execute on function ejecutar_cruce()    from public, anon;
revoke execute on function resolver_origenes() from public, anon;
revoke execute on function mapear_vendedores() from public, anon;
grant  execute on function ejecutar_cruce()    to authenticated;
grant  execute on function resolver_origenes() to authenticated;
grant  execute on function mapear_vendedores() to authenticated;
