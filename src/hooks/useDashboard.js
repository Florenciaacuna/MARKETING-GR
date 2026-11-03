import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useDashboard() {
  const [desde,         setDesde]         = useState('')
  const [hasta,         setHasta]         = useState('')
  const [marcaFiltro,   setMarcaFiltro]   = useState([])
  const [rubroFiltro,   setRubroFiltro]   = useState([])
  const [campanaFiltro, setCampanaFiltro] = useState('')
  const [campanaList,   setCampanaList]   = useState([])
  const [campDetalle,   setCampDetalle]   = useState(null)
  const [loadingDet,    setLoadingDet]    = useState(false)
  const [kpis,          setKpis]          = useState(null)
  const [porMarca,      setPorMarca]      = useState([])
  const [historico,     setHistorico]     = useState([])
  const [campLeads,     setCampLeads]     = useState([])
  const [origenLeads,   setOrigenLeads]   = useState([])
  const [loading,       setLoading]       = useState(true)

  const toggleMarca    = m => setMarcaFiltro(p => p.includes(m) ? p.filter(x=>x!==m) : [...p,m])
  const toggleRubro    = r => setRubroFiltro(p => p.includes(r) ? p.filter(x=>x!==r) : [...p,r])
  const limpiarFiltros = () => { setDesde(''); setHasta(''); setMarcaFiltro([]); setRubroFiltro([]); setCampanaFiltro('') }

  const load = useCallback(async () => {
    setLoading(true)

    const applyV = q => {
      if (desde)              q = q.gte('fecha', desde)
      if (hasta)              q = q.lte('fecha', hasta)
      if (marcaFiltro.length) q = q.in('marca', marcaFiltro)
      if (campanaFiltro)      q = q.eq('campana_id', campanaFiltro)
      return q
    }

    // ── KPIs — 4 queries en paralelo, solo counts ──────────────────────────
    let leadsQ = supabase.from('mkt_leads').select('*', { count:'exact', head:true })
    if (campanaFiltro) leadsQ = leadsQ.eq('campana_id', campanaFiltro)

    const [
      { count: totalVentas },
      { count: ventasConLead },
      { count: totalLeads },
      { count: totalEntregas },
    ] = await Promise.all([
      applyV(supabase.from('mkt_ventas').select('*', { count:'exact', head:true })),
      applyV(supabase.from('mkt_ventas').select('*', { count:'exact', head:true })).not('lead_id', 'is', null),
      leadsQ,
      applyV(supabase.from('mkt_entregas').select('*', { count:'exact', head:true })).not('venta_id', 'is', null),
    ])
    setKpis({ totalVentas, ventasConLead, totalLeads, totalEntregas })

    // ── Paralelo: marca, histórico, origen ─────────────────────────────────
    // Ventas son ≤ 1000 → una sola query sin paginación
    // Leads origen: RPC get_leads_origen_stats() → devuelve totales agrupados (evita paginar 40k filas)
    const [vMarca, vHist, origenRPC] = await Promise.all([
      applyV(supabase.from('mkt_ventas').select('marca,lead_id')).limit(5000).then(r => r.data || []),

      (() => {
        let q = supabase.from('mkt_ventas').select('fecha,lead_id').not('fecha','is',null).limit(5000)
        if (marcaFiltro.length) q = q.in('marca', marcaFiltro)
        if (campanaFiltro)      q = q.eq('campana_id', campanaFiltro)
        return q.then(r => r.data || [])
      })(),

      // ← reemplaza fetchAll de 40k filas: una sola llamada al RPC
      // Si el RPC no fue creado aún en Supabase, devuelve [] sin romper la carga
      supabase.rpc('get_leads_origen_stats', campanaFiltro ? { p_campana_id: campanaFiltro } : {})
        .then(r => {
          if (r.error) {
            console.warn('[Dashboard] RPC get_leads_origen_stats no disponible:', r.error.message)
            return []
          }
          return r.data || []
        }),
    ])

    // Por marca
    const mMap = {}
    vMarca.forEach(v => {
      const m = v.marca || 'Sin marca'
      if (!mMap[m]) mMap[m] = { marca:m, ventas:0, conLead:0 }
      mMap[m].ventas++
      if (v.lead_id) mMap[m].conLead++
    })
    setPorMarca(Object.values(mMap)
      .map(r => ({ ...r, conv: r.ventas > 0 ? r.conLead * 100 / r.ventas : 0 }))
      .sort((a,b) => b.ventas - a.ventas))

    // Histórico — últimos 12 meses
    const last12 = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
      last12.push(d.toISOString().slice(0, 7))
    }
    const hMap = {}
    last12.forEach(m => { hMap[m] = { mes:m, ventas:0, conLead:0 } })
    vHist.forEach(v => {
      const m = (v.fecha || '').slice(0, 7)
      if (hMap[m]) { hMap[m].ventas++; if (v.lead_id) hMap[m].conLead++ }
    })
    setHistorico(last12.map(m => ({
      ...hMap[m],
      label: new Date(m + '-15').toLocaleString('es-AR', { month:'short', year:'2-digit' })
    })))

    // Origen de leads — el RPC ya viene agrupado con {canal, origen, total}
    const oMap = {}
    origenRPC.forEach(row => {
      const k = row.canal || row.origen || 'Sin identificar'
      oMap[k] = (oMap[k] || 0) + Number(row.total)
    })
    const oTotal = Object.values(oMap).reduce((s,n) => s + n, 0)
    setOrigenLeads(
      Object.entries(oMap).sort((a,b) => b[1] - a[1]).slice(0, 10)
        .map(([nombre, leads]) => ({ nombre, leads, pct: oTotal ? Math.round(leads * 100 / oTotal) : 0 }))
    )

    // ── Leads por campaña ────────────────────────────────────────────────────
    // Solo ventas y leads CON campana_id asignada (subconjunto pequeño)
    const ventaFilters = []
    if (campanaFiltro)      ventaFilters.push(q => q.eq('campana_id', campanaFiltro))
    if (desde)              ventaFilters.push(q => q.gte('fecha', desde))
    if (hasta)              ventaFilters.push(q => q.lte('fecha', hasta))
    if (marcaFiltro.length) ventaFilters.push(q => q.in('marca', marcaFiltro))

    // Ventas por campaña + lista de campañas + leads por campaña — paralelo
    let vCampQ = supabase.from('mkt_ventas').select('campana_id').not('campana_id','is',null).limit(5000)
    ventaFilters.forEach(f => { vCampQ = f(vCampQ) })

    let lCampQ = supabase.from('mkt_leads').select('campana_id').not('campana_id','is',null).limit(5000)
    if (campanaFiltro) lCampQ = lCampQ.eq('campana_id', campanaFiltro)

    const [vCampRes, campListRes, lCampRes] = await Promise.all([
      vCampQ.then(r => r.data || []),
      supabase.from('mkt_campanas').select('id,nombre,marca,rubro').then(r => r.data || []),
      lCampQ.then(r => r.data || []),
    ])

    const cMap = {}; campListRes.forEach(c => { cMap[c.id] = c })
    const lMap = {}; lCampRes.forEach(l => { lMap[l.campana_id] = (lMap[l.campana_id] || 0) + 1 })
    const vMap = {}; vCampRes.forEach(v => { vMap[v.campana_id] = (vMap[v.campana_id] || 0) + 1 })

    const result = []
    Object.entries(vMap).forEach(([id, ventas]) => {
      const c = cMap[id]
      if (c) result.push({ id, nombre:c.nombre, marca:c.marca, rubro:c.rubro, leads:lMap[id]||0, ventas })
    })
    setCampLeads(result.sort((a,b) => b.ventas - a.ventas))

    setLoading(false)
  }, [desde, hasta, marcaFiltro, rubroFiltro, campanaFiltro])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('mkt_campanas').select('id,codigo,nombre,marca,rubro').eq('activo', true).order('nombre')
      .then(({ data }) => setCampanaList(data || []))
  }, [])

  useEffect(() => {
    if (!campanaFiltro) { setCampDetalle(null); return }
    setLoadingDet(true)
    Promise.all([
      supabase.from('mkt_campanas').select('id,codigo,nombre,marca,rubro,activo').eq('id', campanaFiltro).single(),
      supabase.from('mkt_ventas').select('id,pv_solicitud,fecha,nombre,dni,vendedor,metodo_match,margen_bruto,bonificacion_terminal,resultado_bruto,gestoria').eq('campana_id', campanaFiltro).order('fecha', { ascending:false }),
      supabase.from('mkt_gastos').select('id,concepto,monto,fecha,proveedor').eq('campana_id', campanaFiltro).order('fecha', { ascending:false }),
      supabase.from('mkt_leads').select('*', { count:'exact', head:true }).eq('campana_id', campanaFiltro),
      supabase.from('mkt_leads').select('*', { count:'exact', head:true }).eq('campana_id', campanaFiltro).eq('fuente', 'manual'),
    ]).then(([{data:camp},{data:preventas},{data:gastos},{count:leadsTotal},{count:leadsEvento}]) => {
      setCampDetalle({
        camp, preventas: preventas||[], gastos: gastos||[],
        leadsDigital: (leadsTotal||0) - (leadsEvento||0),
        leadsEvento:  leadsEvento||0
      })
      setLoadingDet(false)
    })
  }, [campanaFiltro])

  return {
    desde, setDesde, hasta, setHasta,
    marcaFiltro, setMarcaFiltro, toggleMarca,
    rubroFiltro, setRubroFiltro, toggleRubro,
    campanaFiltro, setCampanaFiltro, campanaList,
    limpiarFiltros, loading, loadingDet,
    kpis, porMarca, historico, campLeads, origenLeads,
    campDetalle,
    campFiltered: rubroFiltro.length > 0 ? campLeads.filter(c => rubroFiltro.includes(c.rubro)) : campLeads,
  }
}
