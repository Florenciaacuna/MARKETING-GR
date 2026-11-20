-- =============================================================
-- PASO 4 — Vistas para la pantalla + confirmar / rechazar vínculos
-- =============================================================

-- 4.1 Cada preventa con su estado y su lead principal
drop view if exists preventas_estado;
create view preventas_estado with (security_invoker = true) as
select
  p.id, p.pv, p.marca, p.fecha, to_char(p.fecha, 'YYYY-MM') as mes, p.tipo, p.nombre, p.dni, p.cuit,
  p.tels, p.email, p.vendedor, p.unidad,
  coalesce(u.sucursal, split_part(p.unidad, ' Team', 1), 'Sin clasificar') as sucursal,
  p.es_empresa, p.es_interna, p.conyuge,
  case
    when p.es_interna      then 'interna'
    when lc.es_digital     then 'digital'
    when v.id is not null  then 'sin_digital'
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

-- 4.2 Cada lead con su origen y, si se vinculó, su preventa
drop view if exists leads_con_preventa;
create view leads_con_preventa with (security_invoker = true) as
select
  lc.id, lc.fuente, lc.id_externo, lc.tramite, lc.fecha, lc.nombre,
  lc.dnis, lc.tels, lc.emails, lc.vendedor, lc.campana, lc.consulta,
  lc.facilitador, lc.setter, lc.pagina, lc.anuncio_link, lc.anuncio_texto,
  lc.origen, lc.grupo, lc.sub_origen, lc.es_digital,
  pv.preventas, pv.primera_preventa, pv.marca_preventa, pv.regla
from leads_clasificados lc
left join lateral (
  select string_agg(p.pv, ', ' order by p.fecha) as preventas,
         min(p.fecha)                            as primera_preventa,
         min(p.marca)                            as marca_preventa,
         min(v.regla)                            as regla
    from vinculos v join preventas p on p.id = v.preventa_id
   where v.lead_id = lc.id and (v.es_principal or v.estado = 'confirmado')
) pv on true;

-- 4.3 Vínculos "posibles" para confirmar (la pestaña de revisión)
drop view if exists vinculos_a_revisar;
create view vinculos_a_revisar with (security_invoker = true) as
select
  v.id as vinculo_id, v.regla, v.nivel,
  p.id as preventa_id, p.pv, p.marca, p.fecha as fecha_preventa, p.nombre as cliente,
  p.dni, p.tels as tels_preventa, p.email as email_preventa, p.vendedor, p.conyuge,
  lc.id as lead_id, lc.fuente, lc.fecha as fecha_lead, lc.nombre as nombre_lead,
  lc.dnis, lc.tels as tels_lead, lc.emails as emails_lead, lc.vendedor as vendedor_lead,
  lc.origen, lc.grupo, lc.sub_origen
from vinculos v
join preventas p on p.id = v.preventa_id
join leads_clasificados lc on lc.id = v.lead_id
where v.estado = 'auto' and v.nivel = 'posible'
  and not exists (select 1 from vinculos x where x.preventa_id = v.preventa_id and x.es_principal);

-- 4.3b TODOS los vínculos de cada preventa (no solo el principal)
drop view if exists vinculos_todos;
create view vinculos_todos with (security_invoker = true) as
select
  v.id as vinculo_id, v.preventa_id, v.lead_id, v.regla, v.nivel, v.estado, v.es_principal, v.revisado_por,
  p.pv, p.marca, p.fecha as fecha_preventa, p.nombre as cliente,
  lc.fuente, lc.id_externo, lc.tramite, lc.fecha as fecha_lead, lc.nombre as nombre_lead,
  lc.origen, lc.grupo, lc.sub_origen, lc.es_digital, lc.pagina, lc.anuncio_texto,
  lc.facilitador, lc.setter, lc.vendedor as vendedor_lead
from vinculos v
join preventas p on p.id = v.preventa_id
join leads_clasificados lc on lc.id = v.lead_id;

-- 4.4 Valores de origen que todavía no están en el catálogo
drop view if exists origenes_sin_clasificar;
create view origenes_sin_clasificar with (security_invoker = true) as
select l.origen_fuente as fuente, l.origen_valor as valor_crudo, count(*) as leads
  from leads l
  left join origenes o on o.fuente = l.origen_fuente and o.valor_crudo = l.origen_valor
 where o.id is null and l.origen_valor is not null
 group by 1, 2
 order by 3 desc;

-- 4.5 Elegir el principal de UNA preventa (se usa al confirmar o rechazar)
create or replace function elegir_principal(p_preventa bigint)
returns void
language sql
set search_path = public
as $$
  update vinculos set es_principal = false where preventa_id = p_preventa and es_principal;
  update vinculos set es_principal = true
   where id = (
     select v.id
       from vinculos v join leads_clasificados lc on lc.id = v.lead_id
      where v.preventa_id = p_preventa and v.estado <> 'rechazado'
        and (v.estado = 'confirmado' or v.nivel in ('seguro','probable'))
      order by (v.estado = 'confirmado') desc, lc.es_digital desc, lc.fecha desc nulls last
      limit 1);
$$;

-- 4.6 Confirmar un vínculo (queda fijo: el cruce no lo vuelve a tocar)
create or replace function confirmar_vinculo(p_vinculo bigint, p_usuario text default null)
returns void
language plpgsql
set search_path = public
as $$
declare v_preventa bigint;
begin
  update vinculos set estado = 'confirmado', revisado_por = p_usuario
   where id = p_vinculo returning preventa_id into v_preventa;
  perform elegir_principal(v_preventa);
end $$;

-- 4.7 Rechazar un vínculo (el cruce no lo vuelve a crear)
create or replace function rechazar_vinculo(p_vinculo bigint, p_usuario text default null)
returns void
language plpgsql
set search_path = public
as $$
declare v_preventa bigint;
begin
  update vinculos set estado = 'rechazado', es_principal = false, revisado_por = p_usuario
   where id = p_vinculo returning preventa_id into v_preventa;
  perform elegir_principal(v_preventa);
end $$;

-- 4.8 Vincular a mano una preventa con un lead que el cruce no encontró
create or replace function vincular_manual(p_preventa bigint, p_lead bigint, p_usuario text default null)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into vinculos (preventa_id, lead_id, regla, nivel, estado, revisado_por)
  values (p_preventa, p_lead, 'manual', 'seguro', 'confirmado', p_usuario)
  on conflict (preventa_id, lead_id)
  do update set estado = 'confirmado', regla = 'manual', revisado_por = excluded.revisado_por;
  perform elegir_principal(p_preventa);
end $$;

revoke execute on function elegir_principal(bigint)              from public, anon;
revoke execute on function confirmar_vinculo(bigint, text)       from public, anon;
revoke execute on function rechazar_vinculo(bigint, text)        from public, anon;
revoke execute on function vincular_manual(bigint, bigint, text) from public, anon;
grant  execute on function elegir_principal(bigint)              to authenticated;
grant  execute on function confirmar_vinculo(bigint, text)       to authenticated;
grant  execute on function rechazar_vinculo(bigint, text)        to authenticated;
grant  execute on function vincular_manual(bigint, bigint, text) to authenticated;
