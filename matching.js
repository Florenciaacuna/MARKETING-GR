// =============================================
// MOTOR DE CRUCE — Lead → Venta
// Cruza por DNI (primero) y por teléfono (fallback)
// =============================================

import { normalizeDNI, normalizePhone } from './parsers'

/**
 * Cruza leads con ventas y devuelve atribuciones
 * @param {Array} leads - leads de Celer/Autodealer ya normalizados
 * @param {Array} ventas - ventas de K1/Autodealer ya normalizadas
 * @param {Array} campanas - campañas registradas en el sistema
 * @returns {{ matched, unmatched_ventas, unmatched_leads, stats }}
 */
export function matchLeadsToSales(leads, ventas, campanas = []) {
  // Construir índices para búsqueda rápida O(1)
  const byDNI   = new Map()
  const byPhone = new Map()

  for (const lead of leads) {
    if (lead.dni)     byDNI.set(lead.dni, lead)
    if (lead.telefono) byPhone.set(lead.telefono, lead)
    if (lead.celular)  byPhone.set(lead.celular, lead)
  }

  // Mapa de campañas por código para atribución
  const campanaByCode = new Map()
  for (const c of campanas) {
    if (c.codigo) campanaByCode.set(c.codigo.toLowerCase(), c)
  }

  const matched          = []
  const unmatched_ventas = []
  const matchedLeadIds   = new Set()

  for (const venta of ventas) {
    const vDNI  = normalizeDNI(venta.dni)
    const vTel  = normalizePhone(venta.telefono_personal)
    const vCel  = normalizePhone(venta.celular_personal)

    let lead   = null
    let metodo = null

    // 1. Match por DNI (más confiable)
    if (vDNI && byDNI.has(vDNI)) {
      lead = byDNI.get(vDNI)
      metodo = 'dni'
    }

    // 2. Match por teléfono personal
    if (!lead && vTel && byPhone.has(vTel)) {
      lead = byPhone.get(vTel)
      metodo = 'telefono'
    }

    // 3. Match por celular
    if (!lead && vCel && vCel !== vTel && byPhone.has(vCel)) {
      lead = byPhone.get(vCel)
      metodo = 'celular'
    }

    if (lead) {
      matchedLeadIds.add(lead.nro_tramite || lead.id)

      // Resolver campaña
      let campana = null
      if (lead.codigo_campana) {
        campana = campanaByCode.get(lead.codigo_campana.toLowerCase()) || null
      }

      matched.push({
        venta,
        lead,
        metodo,
        campana_id:     campana?.id || null,
        campana_nombre: campana?.nombre || lead.codigo_campana || null,
        campana_codigo: lead.codigo_campana || null,
      })
    } else {
      unmatched_ventas.push(venta)
    }
  }

  const unmatched_leads = leads.filter(l =>
    !matchedLeadIds.has(l.nro_tramite || l.id)
  )

  const stats = {
    total_ventas:      ventas.length,
    total_leads:       leads.length,
    ventas_atribuidas: matched.length,
    ventas_sin_lead:   unmatched_ventas.length,
    leads_sin_venta:   unmatched_leads.length,
    tasa_atribucion:   ventas.length > 0
      ? Math.round((matched.length / ventas.length) * 100)
      : 0,
    por_metodo: {
      dni:      matched.filter(m => m.metodo === 'dni').length,
      telefono: matched.filter(m => m.metodo === 'telefono').length,
      celular:  matched.filter(m => m.metodo === 'celular').length,
    }
  }

  return { matched, unmatched_ventas, unmatched_leads, stats }
}
