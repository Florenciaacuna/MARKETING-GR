-- =============================================================
-- PASO 5 — Base para el futuro: trámite declarado, regla en cadena,
--          "De Paso de carga", seguimiento por vendedor/sucursal y fuentes nuevas
-- Se corre encima de lo anterior; no borra datos.
-- =============================================================

-- 5.1 Nº de trámite declarado en la preventa (a mano hoy; desde el reporte en el futuro)
alter table preventas add column if not exists tramite_declarado text;

-- 5.2 Lugar para fuentes nuevas de leads (Darwin, formularios de Meta, Mercado Libre...)
alter table leads    drop constraint if exists leads_fuente_check;
alter table leads    add  constraint leads_fuente_check
  check (fuente in ('celer','derivado','darwin','meta','mercadolibre','otro'));
alter table origenes drop constraint if exists origenes_fuente_check;
alter table origenes add  constraint origenes_fuente_check
  check (fuente in ('celer','derivado','darwin','meta','mercadolibre','otro'));

-- 5.3 El cruce, con dos reglas nuevas: "declarado" y "cadena"
-- Reglas:
--   SEGURO    trámite declarado · dni · cuit (8 del medio) · teléfono (10 dígitos) · email
--   PROBABLE  últimos 8 del tel + apellido · tel sin característica (7) + apellido · mismo vendedor + nombre completo
--             · en cadena (datos del De Paso → lead digital anterior)
--   POSIBLE   últimos 8 / 7 sin apellido · vendedor + apellido poco común (90 días) · nombre completo · cónyuge · email parecido
-- Solo leads anteriores a la preventa (+5 días de tolerancia). Reglas por nombre: hasta 180 días antes.
-- Confirmados y rechazados a mano no se tocan. Principal: confirmado > último lead digital > último contacto.
create index if not exists leads_tramite_idx    on leads (tramite);
create index if not exists leads_id_externo_idx on leads (id_externo);

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

  -- Todas las "llaves" de los leads en una lista (DNI, teléfonos, emails): hace el cruce rápido
  create temp table claves_leads on commit drop as
              select id as lead_id, 'dni'::text as tipo, unnest(dnis)        as valor from leads
    union all select id, 'tel',    unnest(tels)        from leads
    union all select id, 'tel8',   unnest(tels8)       from leads
    union all select id, 'tel7',   unnest(tels7)       from leads
    union all select id, 'email',  unnest(emails)      from leads
    union all select id, 'emailb', unnest(emails_base) from leads;
  create index on claves_leads (tipo, valor);
  create index on claves_leads (lead_id);
  analyze claves_leads;

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
  pt as (select p.id, p.fecha, p.apellido_tokens, t
           from p cross join lateral unnest(p.tels) t
          where t not in (select valor from claves_compartidas)),
  c as (
    -- SEGURO
    select p.id pid, l.id lid, 'declarado' regla, 0 rango, false solo_nombre
      from p join leads l on l.tramite = p.tramite_declarado
    union all
    select p.id, l.id, 'declarado', 0, false
      from p join leads l on l.id_externo = p.tramite_declarado
    union all
    select p.id, k.lead_id, case when p.dni_desde_cuit then 'cuit' else 'dni' end, 1, false
      from p join claves_leads k on k.tipo = 'dni' and k.valor = p.dni
    union all
    select pt.id, k.lead_id, 'telefono', 2, false
      from pt join claves_leads k on k.tipo = 'tel' and k.valor = pt.t
     where length(pt.t) = 10
    union all
    select p.id, k.lead_id, 'email', 3, false
      from p join claves_leads k on k.tipo = 'email' and k.valor = p.email
     where p.email not in (select valor from claves_compartidas)
    -- PROBABLE / POSIBLE: últimos 8 del teléfono
    union all
    select p.id, l.id,
           case when l.nombre_tokens && p.apellido_tokens then 'tel8+apellido' else 'tel8' end,
           case when l.nombre_tokens && p.apellido_tokens then 4 else 6 end, false
      from p cross join lateral unnest(p.tels8) t
      join claves_leads k on k.tipo = 'tel8' and k.valor = t
      join leads l on l.id = k.lead_id
     where t not in (select valor from claves_compartidas)
    -- Teléfono de la preventa sin característica (7 dígitos)
    union all
    select pt.id, l.id,
           case when l.nombre_tokens && pt.apellido_tokens then 'tel7+apellido' else 'tel7' end,
           case when l.nombre_tokens && pt.apellido_tokens then 4 else 6 end, false
      from pt join claves_leads k on k.tipo = 'tel7' and k.valor = pt.t
      join leads l on l.id = k.lead_id
     where length(pt.t) = 7
    -- Mismo vendedor (apellido poco común o nombre completo), hasta 90 días antes
    union all
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
      from p join claves_leads k on k.tipo = 'emailb' and k.valor = p.email_base
      join leads l on l.id = k.lead_id
     where not (l.emails @> array[coalesce(p.email,'')])
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

  -- EN CADENA: si la preventa solo tiene leads no digitales (ej. un De Paso),
  -- se usan los datos de ese lead para buscar un lead digital anterior
  create temp table con_digital on commit drop as
    select distinct x.preventa_id
      from vinculos x join leads_clasificados lx on lx.id = x.lead_id
     where x.estado <> 'rechazado' and x.nivel in ('seguro','probable') and lx.es_digital;

  insert into vinculos (preventa_id, lead_id, regla, nivel)
  select distinct v.preventa_id, k2.lead_id, 'cadena', 'probable'
    from vinculos v
    join preventas p on p.id = v.preventa_id
    join claves_leads k1 on k1.lead_id = v.lead_id and k1.tipo in ('dni','tel','email')
    join claves_leads k2 on k2.tipo = k1.tipo and k2.valor = k1.valor and k2.lead_id <> v.lead_id
    join leads_clasificados d on d.id = k2.lead_id and d.es_digital
   where v.estado = 'auto' and v.nivel in ('seguro','probable') and not p.es_interna
     and v.preventa_id not in (select preventa_id from con_digital)
     and k1.valor not in (select valor from claves_compartidas)
     and (d.fecha is null or p.fecha is null or d.fecha::date <= p.fecha + 5)
  on conflict (preventa_id, lead_id) do nothing;

  -- Vínculo principal de cada preventa
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
revoke execute on function ejecutar_cruce() from public, anon;
grant  execute on function ejecutar_cruce() to authenticated;

-- 5.4 Declarar el trámite de una preventa desde la pantalla
create or replace function declarar_tramite(p_preventa bigint, p_tramite text, p_usuario text default null)
returns integer
language plpgsql
set search_path = public
as $$
declare encontrados integer;
begin
  update preventas set tramite_declarado = nullif(trim(p_tramite), '') where id = p_preventa;
  insert into vinculos (preventa_id, lead_id, regla, nivel, estado, revisado_por)
  select p_preventa, l.id, 'declarado', 'seguro', 'confirmado', p_usuario
    from leads l where l.tramite = trim(p_tramite) or l.id_externo = trim(p_tramite)
  on conflict (preventa_id, lead_id)
  do update set regla = 'declarado', nivel = 'seguro', estado = 'confirmado', revisado_por = excluded.revisado_por;
  get diagnostics encontrados = row_count;
  perform elegir_principal(p_preventa);
  return encontrados;   -- 0 = ese trámite todavía no está cargado
end $$;
revoke execute on function declarar_tramite(bigint, text, text) from public, anon;
grant  execute on function declarar_tramite(bigint, text, text) to authenticated;

-- 5.5 Estado de cada preventa, separando "De Paso de carga" (origen no registrado)
--     Estados: digital · presencial · no_registrado · posible · sin_vinculo · interna
drop view if exists preventas_estado cascade;
create view preventas_estado with (security_invoker = true) as
select
  p.id, p.pv, p.marca, p.fecha, to_char(p.fecha, 'YYYY-MM') as mes, p.tipo, p.nombre, p.dni, p.cuit,
  p.tels, p.email, p.vendedor, p.unidad,
  coalesce(u.sucursal, split_part(p.unidad, ' Team', 1), 'Sin clasificar') as sucursal,
  p.es_empresa, p.es_interna, p.conyuge, p.tramite_declarado,
  case
    when p.es_interna      then 'interna'
    when lc.es_digital     then 'digital'
    -- De Paso / Cita creado ±3 días de la venta: lo creó el vendedor para cargar la preventa
    when v.id is not null and lc.grupo = 'Presencial'
         and abs(p.fecha - lc.fecha::date) <= 3 then 'no_registrado'
    when v.id is not null  then 'presencial'
    when exists (select 1 from vinculos x where x.preventa_id = p.id
                  and x.estado = 'auto' and x.nivel = 'posible') then 'posible'
    else 'sin_vinculo'
  end                          as estado,
  v.id                         as vinculo_id,
  v.regla, v.nivel,
  v.estado                     as vinculo_estado,
  lc.id                        as lead_id,
  lc.fuente                    as lead_fuente,
  lc.id_externo                as lead_id_externo,
  lc.nombre                    as lead_nombre,
  lc.fecha                     as lead_fecha,
  lc.tramite                   as lead_tramite,
  lc.origen, lc.grupo, lc.sub_origen, lc.campana,
  lc.pagina, lc.anuncio_link, lc.anuncio_texto,
  lc.facilitador, lc.setter,
  lc.vendedor                  as lead_vendedor,
  (p.fecha - lc.fecha::date)   as dias_lead_a_venta,
  vis.ultima_visita
from preventas p
left join unidades u on u.unidad = p.unidad
left join vinculos v on v.preventa_id = p.id and v.es_principal
left join leads_clasificados lc on lc.id = v.lead_id
left join lateral (
  select max(l2.fecha) as ultima_visita
    from vinculos v2 join leads_clasificados l2 on l2.id = v2.lead_id
   where v2.preventa_id = p.id and v2.estado <> 'rechazado' and not l2.es_digital
) vis on true;


-- 5.6 Seguimiento por vendedor, sucursal y mes
drop view if exists seguimiento;
create view seguimiento with (security_invoker = true) as
select
  mes, sucursal, vendedor,
  count(*)                                              as preventas,
  count(*) filter (where estado = 'digital')            as digital,
  count(*) filter (where estado = 'presencial')         as presencial,
  count(*) filter (where estado = 'no_registrado')      as origen_no_registrado,
  count(*) filter (where estado = 'posible')            as posibles,
  count(*) filter (where estado = 'sin_vinculo')        as sin_vinculo,
  round(100.0 * count(*) filter (where estado = 'digital') / nullif(count(*), 0), 1) as pct_digital
from preventas_estado
where estado <> 'interna'
group by 1, 2, 3;
