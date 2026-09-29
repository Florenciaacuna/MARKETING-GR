import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

async function fetchAll(table, selectStr, notNullCol = null, filters = []) {
  const PAGE = 1000; let all = [], from = 0
  while (true) {
    let q = supabase.from(table).select(selectStr).range(from, from + PAGE - 1)
    if (notNullCol) q = q.not(notNullCol, 'is', null)
    filters.forEach(f => { q = f(q) })
    const { data } = await q
    if (!data?.length) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

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

    // ── KPIs ────────────────────────────────────────────────────────────────
    let leadsQ = supabase.from('mkt_leads').select('*',{count:'exact',head:true})
    if (campanaFiltro) leadsQ = leadsQ.eq('campana_id', campanaFiltro)

    const [
      { count: totalVentas },
      { count: ventasConLead },
      { count: totalLeads },
      { count: totalEntregas },
    ] = await Promise.all([
      applyV(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})),
      applyV(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})).not('lead_id','is',null),
      leadsQ,
      applyV(supabase.from('mkt_entregas').select('*',{count:'exact',head:true})).not('venta_id','is',null),
    ])
    setKpis({ totalVentas, ventasConLead, totalLeads, totalEntregas })

    // ── Por marca, histórico, origen — en paralelo ───────────────────────
    const [vMarca, vHist, origenData] = await Promise.all([
      applyV(supabase.from('mkt_ventas').select('marca,lead_id')).limit(20000).then(r=>r.data||[]),
      (() => {
        let q = supabase.from('mkt_ventas').select('fecha,lead_id').not('fecha','is',null).limit(20000)
        if (marcaFiltro.length) q = q.in('marca', marcaFiltro)
        if (campanaFiltro)      q = q.eq('campana_id', campanaFiltro)
        return q.then(r=>r.data||[])
      })(),
      fetchAll('mkt_leads','canal,origen',null, campanaFiltro ? [q=>q.eq('campana_id',campanaFiltro)] : [])
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
      .map(r => ({ ...r, conv: r.ventas>0 ? r.conLead*100/r.ventas : 0 }))
      .sort((a,b) => b.ventas-a.ventas))

    // Histórico — siempre últimos 12 meses
    const last12 = []
    for (let i=11;i>=0;i--) {
      const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i)
      last12.push(d.toISOString().slice(0,7))
    }
    const hMap = {}
    last12.forEach(m => { hMap[m] = { mes:m, ventas:0, conLead:0 } })
    vHist.forEach(v => {
      const m=(v.fecha||'').slice(0,7)
      if (hMap[m]) { hMap[m].ventas++; if (v.lead_id) hMap[m].conLead++ }
    })
    setHistorico(last12.map(m => ({
      ...hMap[m],
      label: new Date(m+'-15').toLocaleString('es-AR',{month:'short',year:'2-digit'})
    })))

    // Origen de leads
    const oMap = {}
    origenData.forEach(l => { const k=l.canal||l.origen||'Sin identificar'; oMap[k]=(oMap[k]||0)+1 })
    const oTotal = Object.values(oMap).reduce((s,n)=>s+n,0)
    setOrigenLeads(
      Object.entries(oMap).sort((a,b)=>b[1]-a[1]).slice(0,10)
        .map(([nombre,leads]) => ({ nombre, leads, pct: oTotal?Math.round(leads*100/oTotal):0 }))
    )

    // ── Leads por campaña ────────────────────────────────────────────────
    const ventaFilters = []
    if (campanaFiltro)      ventaFilters.push(q=>q.eq('campana_id',campanaFiltro))
    if (desde)              ventaFilters.push(q=>q.gte('fecha',desde))
    if (hasta)              ventaFilters.push(q=>q.lte('fecha',hasta))
    if (marcaFiltro.length) ventaFilters.push(q=>q.in('marca',marcaFiltro))

    const [lCamp, vCamp, campListData] = await Promise.all([
      fetchAll('mkt_leads','campana_id','campana_id'),
      fetchAll('mkt_ventas','campana_id','campana_id',ventaFilters),
      supabase.from('mkt_campanas').select('id,nombre,marca,rubro').then(r=>r.data||[])
    ])
    const cMap={}; campListData.forEach(c=>{cMap[c.id]=c})
    const lMap={}; lCamp.forEach(l=>{lMap[l.campana_id]=(lMap[l.campana_id]||0)+1})
    const vMap={}; vCamp.forEach(v=>{vMap[v.campana_id]=(vMap[v.campana_id]||0)+1})
    const result=[]
    Object.entries(vMap).forEach(([id,ventas])=>{
      const c=cMap[id]; if(c) result.push({id,nombre:c.nombre,marca:c.marca,rubro:c.rubro,leads:lMap[id]||0,ventas})
    })
    setCampLeads(result.sort((a,b)=>b.ventas-a.ventas))

    setLoading(false)
  }, [desde, hasta, marcaFiltro, rubroFiltro, campanaFiltro])

  useEffect(()=>{ load() },[load])

  useEffect(()=>{
    supabase.from('mkt_campanas').select('id,codigo,nombre,marca,rubro').eq('activo',true).order('nombre')
      .then(({data})=>setCampanaList(data||[]))
  },[])

  useEffect(()=>{
    if (!campanaFiltro) { setCampDetalle(null); return }
    setLoadingDet(true)
    Promise.all([
      supabase.from('mkt_campanas').select('id,codigo,nombre,marca,rubro,activo').eq('id',campanaFiltro).single(),
      supabase.from('mkt_ventas').select('id,pv_solicitud,fecha,nombre,dni,vendedor,metodo_match,margen_bruto,bonificacion_terminal,resultado_bruto,gestoria').eq('campana_id',campanaFiltro).order('fecha',{ascending:false}),
      supabase.from('mkt_gastos').select('id,concepto,monto,fecha,proveedor').eq('campana_id',campanaFiltro).order('fecha',{ascending:false}),
      supabase.from('mkt_leads').select('*',{count:'exact',head:true}).eq('campana_id',campanaFiltro),
      supabase.from('mkt_leads').select('*',{count:'exact',head:true}).eq('campana_id',campanaFiltro).eq('fuente','manual'),
    ]).then(([{data:camp},{data:preventas},{data:gastos},{count:leadsTotal},{count:leadsEvento}])=>{
      setCampDetalle({
        camp, preventas:preventas||[], gastos:gastos||[],
        leadsDigital:(leadsTotal||0)-(leadsEvento||0),
        leadsEvento:leadsEvento||0
      })
      setLoadingDet(false)
    })
  },[campanaFiltro])

  return {
    desde, setDesde, hasta, setHasta,
    marcaFiltro, setMarcaFiltro, toggleMarca,
    rubroFiltro, setRubroFiltro, toggleRubro,
    campanaFiltro, setCampanaFiltro, campanaList,
    limpiarFiltros, loading, loadingDet,
    kpis, porMarca, historico, campLeads, origenLeads,
    campDetalle,
    campFiltered: rubroFiltro.length>0 ? campLeads.filter(c=>rubroFiltro.includes(c.rubro)) : campLeads,
  }
}
