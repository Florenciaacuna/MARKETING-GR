import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import DatePicker from '../components/DatePicker'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar
} from 'recharts'

const BRAND   = '#B5E000'
const PALETTE = ['#B5E000','#8ca800','#5f7200','#d4f000','#a3c200','#3d5200','#6b8a00','#e8ff4d']
const GRAY3   = '#2a2a2a'

const fmt    = n  => (n || 0).toLocaleString('es-AR')
const fmtPct   = (a,b) => b > 0 ? (a * 100 / b).toFixed(1) + '%' : '0%'
const fmtPesos = n => (n||0).toLocaleString('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 })

const MARCAS = ['KIARA','CIARA','PEARA','MOVILIS','SALRA','HUERTAS','LAFABRICAUS','SELECCIÓN']
const RUBROS = ['0KM','PDA','USADOS','V.E','COMPRA','POSTVENTA']

const TipCustom = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:8, padding:'8px 12px', fontSize:11 }}>
      <div style={{ color:'#fff', fontWeight:700, marginBottom:4 }}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color: p.color || BRAND }}>{p.name}: {fmt(p.value)}</div>)}
    </div>
  )
}

const PieLegendCustom = ({ payload }) => (
  <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center', marginTop:8 }}>
    {(payload||[]).map((p,i) => (
      <div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10 }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:p.color }}/>
        <span style={{ color:'#9ca3af' }}>{p.value}</span>
      </div>
    ))}
  </div>
)

export default function Dashboard() {
  const [desde,        setDesde]        = useState('')
  const [hasta,        setHasta]        = useState('')
  const [marcaFiltro,  setMarcaFiltro]  = useState([])
  const [rubroFiltro,  setRubroFiltro]  = useState([])
  const [kpis,         setKpis]         = useState(null)
  const [campanaFiltro, setCampanaFiltro] = useState('')
  const [campanaList,   setCampanaList]   = useState([])
  const [campDetalle,   setCampDetalle]   = useState(null) // { camp, preventas, gastos, leadsDigital, leadsEvento }
  const [loadingDet,    setLoadingDet]    = useState(false)
  const [porMarca,     setPorMarca]     = useState([])
  const [historico,    setHistorico]    = useState([])
  const [campLeads,    setCampLeads]    = useState([])
  const [origenLeads,  setOrigenLeads]  = useState([])
  const [loading,      setLoading]      = useState(true)

  function toggleMarca(m) {
    setMarcaFiltro(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }
  function toggleRubro(r) {
    setRubroFiltro(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

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

  const load = useCallback(async () => {
    setLoading(true)

    // Build venta filters
    const applyV = q => {
      if (desde) q = q.gte('fecha', desde)
      if (hasta) q = q.lte('fecha', hasta)
      if (marcaFiltro.length > 0) q = q.in('marca', marcaFiltro)
      if (campanaFiltro) q = q.eq('campana_id', campanaFiltro)
      return q
    }

    // --- KPIs globales ---
    let leadsQuery = supabase.from('mkt_leads').select('*',{count:'exact',head:true})
    if (campanaFiltro) leadsQuery = leadsQuery.eq('campana_id', campanaFiltro)
    if (desde)         leadsQuery = leadsQuery.gte('fecha_consulta', desde)
    if (hasta)         leadsQuery = leadsQuery.lte('fecha_consulta', hasta)

    const [
      { count: totalVentas },
      { count: ventasConLead },
      { count: totalLeads },
      { count: totalEntregas },
    ] = await Promise.all([
      applyV(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})),
      applyV(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})).not('lead_id','is',null),
      leadsQuery,
      applyV(supabase.from('mkt_entregas').select('*',{count:'exact',head:true})).not('venta_id','is',null),
    ])
    setKpis({ totalVentas, ventasConLead, totalLeads, totalEntregas })

    // --- Por marca: ventas totales + con lead ---
    const { data: vMarca } = await applyV(
      supabase.from('mkt_ventas').select('marca,lead_id')
    ).limit(20000)

    if (vMarca) {
      const map = {}
      vMarca.forEach(v => {
        const m = v.marca || 'Sin marca'
        if (!map[m]) map[m] = { marca: m, ventas: 0, conLead: 0 }
        map[m].ventas++
        if (v.lead_id) map[m].conLead++
      })
      // Leads por marca (via campana)
      const { data: lMarca } = await supabase.from('mkt_leads')
        .select('codigo_campana, mkt_campanas!mkt_leads_campana_id_fkey(marca)')
        .not('codigo_campana','is',null).limit(50000)
      const leadsMap = {}
      if (lMarca) {
        lMarca.forEach(l => {
          const m = (l.mkt_campanas && l.mkt_campanas.marca) ? l.mkt_campanas.marca : null
          if (m) leadsMap[m] = (leadsMap[m] || 0) + 1
        })
      }
      const arr = Object.values(map)
        .map(r => ({ ...r, leads: leadsMap[r.marca] || 0 }))
        .sort((a,b) => b.ventas - a.ventas)
      setPorMarca(arr)
    }

    // --- Histórico mensual ---
    const { data: vHist } = await supabase.from('mkt_ventas')
      .select('fecha,lead_id').not('fecha','is',null).limit(20000)
    if (vHist) {
      const map = {}
      vHist.forEach(v => {
        const mes = v.fecha.slice(0,7)
        if (!map[mes]) map[mes] = { mes, ventas:0, conLead:0 }
        map[mes].ventas++
        if (v.lead_id) map[mes].conLead++
      })
      const sorted = Object.values(map).sort((a,b) => a.mes.localeCompare(b.mes))
      setHistorico(sorted.map(m => ({
        ...m,
        label: new Date(m.mes+'-15').toLocaleString('es-AR',{month:'short',year:'2-digit'})
      })))
    }

    // --- Filtros para leads ---
    const leadFilters = []
    if (campanaFiltro) leadFilters.push(q => q.eq('campana_id', campanaFiltro))
    if (desde)         leadFilters.push(q => q.gte('fecha_consulta', desde))
    if (hasta)         leadFilters.push(q => q.lte('fecha_consulta', hasta))

    // --- Filtros para ventas del bloque campañas ---
    const ventaFilters = []
    if (campanaFiltro) ventaFilters.push(q => q.eq('campana_id', campanaFiltro))
    if (desde)         ventaFilters.push(q => q.gte('fecha', desde))
    if (hasta)         ventaFilters.push(q => q.lte('fecha', hasta))
    if (marcaFiltro.length > 0) ventaFilters.push(q => q.in('marca', marcaFiltro))

    // --- Origen de leads (con filtros de fecha y campaña) ---
    const origenData = await fetchAll('mkt_leads', 'canal,origen,fecha_consulta', null, leadFilters)
    if (origenData) {
      const map = {}
      origenData.forEach(l => {
        const key = l.canal || l.origen || 'Sin identificar'
        map[key] = (map[key]||0)+1
      })
      const arr = Object.entries(map)
        .sort((a,b) => b[1]-a[1])
        .slice(0,10)
        .map(([nombre,leads]) => ({ nombre, leads }))
      setOrigenLeads(arr)
    }

    // --- Leads y ventas por campaña usando campana_id FK directo ---
    const [lCamp, vCampDirect, campList] = await Promise.all([
      fetchAll('mkt_leads',  'campana_id', 'campana_id'),
      fetchAll('mkt_ventas', 'campana_id', 'campana_id', ventaFilters),
      supabase.from('mkt_campanas').select('id,codigo,nombre,marca,rubro').then(r => r.data || [])
    ])
    if (campList?.length) {
      const campMap = {}
      campList.forEach(c => { campMap[c.id] = c })
      const lMap = {}
      lCamp.forEach(l => { lMap[l.campana_id] = (lMap[l.campana_id]||0)+1 })
      const vMap = {}
      vCampDirect.forEach(v => { vMap[v.campana_id] = (vMap[v.campana_id]||0)+1 })
      const result = []
      Object.entries(vMap).forEach(([id, ventas]) => {
        const camp = campMap[id]
        if (!camp) return
        result.push({ id, nombre:camp.nombre, marca:camp.marca, rubro:camp.rubro, leads:lMap[id]||0, ventas })
      })
      setCampLeads(result.sort((a,b) => b.ventas - a.ventas))
    }

    setLoading(false)
  }, [desde, hasta, marcaFiltro, rubroFiltro, campanaFiltro])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('mkt_campanas').select('id,codigo,nombre,marca,rubro')
      .eq('activo', true).order('nombre')
      .then(({ data }) => setCampanaList(data || []))
  }, [])

  useEffect(() => {
    if (!campanaFiltro) { setCampDetalle(null); return }
    setLoadingDet(true)
    Promise.all([
      supabase.from('mkt_campanas').select('id,codigo,nombre,marca,rubro,activo').eq('id', campanaFiltro).single(),
      supabase.from('mkt_ventas').select('id,pv_solicitud,fecha,nombre,dni,vendedor,metodo_match,margen_bruto,bonificacion_terminal,resultado_bruto,gestoria').eq('campana_id', campanaFiltro).order('fecha', { ascending: false }),
      supabase.from('mkt_gastos').select('id,concepto,monto,fecha,proveedor').eq('campana_id', campanaFiltro).order('fecha', { ascending: false }),
      supabase.from('mkt_leads').select('*', { count:'exact', head:true }).eq('campana_id', campanaFiltro),
      supabase.from('mkt_leads').select('*', { count:'exact', head:true }).eq('campana_id', campanaFiltro).eq('fuente','manual')
    ]).then(([{ data: camp }, { data: preventas }, { data: gastos }, { count: leadsDigital }, { count: leadsEvento }]) => {
      setCampDetalle({ camp, preventas: preventas||[], gastos: gastos||[], leadsDigital: leadsDigital||0, leadsEvento: leadsEvento||0 })
      setLoadingDet(false)
    })
  }, [campanaFiltro])

  const pctConversion = fmtPct(kpis ? kpis.ventasConLead : 0, kpis ? kpis.totalVentas : 0)
  const pieMarcas     = porMarca.slice(0,8).map((m,i) => ({ name: m.marca, value: m.ventas, leads: m.leads }))
  const pieMarcasL    = porMarca.filter(m => m.leads > 0).slice(0,8).map(m => ({ name: m.marca, value: m.leads }))
  const campFiltered  = rubroFiltro.length > 0 ? campLeads.filter(c => rubroFiltro.includes(c.rubro)) : campLeads

  return (
    <div className="space-y-4">

      {/* FILTROS */}
      <div className="card">
        <div className="filter-bar" style={{ flexWrap:'wrap', gap:'8px 12px' }}>

          {/* Fecha */}
          <DatePicker label="Desde" value={desde} onChange={setDesde} maxDate={hasta||undefined} />
          <DatePicker label="Hasta" value={hasta} onChange={setHasta} minDate={desde||undefined} />
          <div className="filter-sep"/>

          {/* Accesos rápidos fecha */}
          <button onClick={() => { const d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'); setDesde(d.getFullYear()+'-'+m+'-01'); setHasta(d.getFullYear()+'-'+m+'-31') }}
            className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0" style={{ background:'#1a2e00', color:BRAND, border:'1px solid #2a3d00' }}>Mes actual</button>
          <button onClick={() => { const y=new Date().getFullYear(); setDesde(y+'-01-01'); setHasta(y+'-12-31') }}
            className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0" style={{ background:'#1a2e00', color:BRAND, border:'1px solid #2a3d00' }}>Año</button>
          <div className="filter-sep"/>

          {/* Marca */}
          <span className="text-xs text-gray-600 font-bold uppercase flex-shrink-0">Marca</span>
          {MARCAS.map(m => (
            <button key={m} onClick={() => toggleMarca(m)}
              className="text-xs px-2.5 py-1 rounded-lg font-medium flex-shrink-0 transition-all"
              style={{
                background: marcaFiltro.includes(m) ? BRAND : '#1a1a1a',
                color:      marcaFiltro.includes(m) ? '#000' : '#6b7280',
                border:    `1px solid ${marcaFiltro.includes(m) ? BRAND : '#2a2a2a'}`
              }}>{m}</button>
          ))}
          <div className="filter-sep"/>

          {/* Rubro */}
          <span className="text-xs text-gray-600 font-bold uppercase flex-shrink-0">Rubro</span>
          {RUBROS.map(r => (
            <button key={r} onClick={() => toggleRubro(r)}
              className="text-xs px-2.5 py-1 rounded-lg font-medium flex-shrink-0 transition-all"
              style={{
                background: rubroFiltro.includes(r) ? BRAND : '#1a1a1a',
                color:      rubroFiltro.includes(r) ? '#000' : '#6b7280',
                border:    `1px solid ${rubroFiltro.includes(r) ? BRAND : '#2a2a2a'}`
              }}>{r}</button>
          ))}
          <div className="filter-sep"/>

          {/* Campaña */}
          <span className="text-xs text-gray-600 font-bold uppercase flex-shrink-0">Campaña</span>
          <select className="input-dark flex-shrink-0" style={{ minWidth:220, maxWidth:320 }}
            value={campanaFiltro} onChange={e => setCampanaFiltro(e.target.value)}>
            <option value="">Todas</option>
            {campanaList
              .filter(c => marcaFiltro.length === 0 || marcaFiltro.includes(c.marca))
              .filter(c => rubroFiltro.length === 0 || rubroFiltro.includes(c.rubro))
              .map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
          </select>
          <div className="filter-sep"/>

          {/* Limpiar */}
          <button onClick={() => { setDesde(''); setHasta(''); setMarcaFiltro([]); setRubroFiltro([]); setCampanaFiltro('') }}
            className="btn-ghost text-xs flex-shrink-0">Limpiar todo</button>

        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:'LEADS',          value: fmt(campanaFiltro && campLeads.length ? campLeads[0]?.leads || 0 : (kpis ? kpis.totalLeads : 0)), sub: campanaFiltro ? 'leads de la campaña' : 'consultas digitales' },
          { label:'PREVENTAS',         value: fmt(kpis ? kpis.totalVentas   : 0), sub:'prepreventas cargadas', accent:true },
          { label:'CON LEAD',       value: fmt(kpis ? kpis.ventasConLead : 0), sub:'origen identificado', accent:true },
          { label:'CONVERSIÓN',     value: pctConversion,                       sub:'preventas / total preventas' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-4 border" style={{ background: k.accent ? '#1a2e00' : '#111', borderColor: k.accent ? BRAND : GRAY3 }}>
            <div className="text-2xl font-black" style={{ color: k.accent ? BRAND : '#fff' }}>{loading ? '—' : k.value}</div>
            <div className="text-xs font-black uppercase mt-1 tracking-widest" style={{ color: k.accent ? BRAND : '#4b5563' }}>{k.label}</div>
            <div className="text-xs mt-0.5" style={{ color:'#374151' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* DETALLE DE CAMPAÑA */}
      {campanaFiltro && (
        <div className="space-y-4">
          {loadingDet ? (
            <div className="card text-center text-xs py-6" style={{ color:'#4b5563' }}>Cargando campaña...</div>
          ) : campDetalle && (() => {
            const inv  = (campDetalle.gastos||[]).reduce((s,g)=>s+(g.monto||0),0)
            const res  = (campDetalle.preventas||[]).reduce((s,v)=>s+(v.resultado_bruto||0),0)
            const gest = (campDetalle.preventas||[]).reduce((s,v)=>s+(v.gestoria||0),0)
            const resConGest = res + gest
            const roi  = inv>0 && res>0 ? ((res-inv)/inv*100).toFixed(1) : null
            const roiConGest = inv>0 && resConGest>0 ? ((resConGest-inv)/inv*100).toFixed(1) : null
            const pvC  = campDetalle.preventas?.length || 0
            return (
              <>
                <div className="rounded-xl p-5 border" style={{ background:'#1a2e00', borderColor: BRAND }}>
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl font-black text-white">{campDetalle.camp?.nombre}</span>
                        {campDetalle.camp?.codigo && (
                          <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background:'#2a3d00', color:BRAND }}>[{campDetalle.camp.codigo}]</span>
                        )}
                      </div>
                      <div className="text-xs" style={{ color:'#6b7280' }}>{campDetalle.camp?.marca} · {campDetalle.camp?.rubro}</div>
                    </div>
                    <div className="flex gap-8 flex-wrap">
                      {[
                        { label:'LEADS',          val: fmt((campDetalle.leadsDigital||0)+(campDetalle.leadsEvento||0)), color:'#fff' },
                        { label:'LEADS DIGITAL', val: fmt(campDetalle.leadsDigital), color:'#9ca3af', big:false },
                        { label:'LEADS EVENTO',  val: fmt(campDetalle.leadsEvento),  color:'#6b7280', big:false },
                        { label:'PREVENTAS', val: fmt(pvC),                   color: BRAND  },
                        { label:'INVERSIÓN', val: fmtPesos(inv),              color:'#fff'  },
                        { label:'RESULTADO', val: fmtPesos(res),              color: res>=0?BRAND:'#ef4444' },
                        { label:'ROI S/GEST',  val: roi?roi+'%':'—',              color: roi?(parseFloat(roi)>0?'#9ca3af':'#ef4444'):'#4b5563', big:false },
                        { label:'ROI C/GEST',  val: roiConGest?roiConGest+'%':'—', color: roiConGest?(parseFloat(roiConGest)>0?BRAND:'#ef4444'):'#4b5563', big:true },
                      ].map(k => (
                        <div key={k.label} className="text-center">
                          <div className={k.big?'text-3xl font-black':'text-xl font-black'} style={{ color:k.color }}>{k.val}</div>
                          <div className="text-xs font-bold uppercase mt-0.5" style={{ color:'#4b5563' }}>{k.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {campDetalle.gastos?.length > 0 && (
                  <div className="card">
                    <div className="section-header mb-3">
                      <h2>Inversión de la campaña</h2>
                      <span className="count-badge">{fmtPesos(inv)}</span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
                      <table className="dark-table">
                        <thead><tr><th>Fecha</th><th>Concepto</th><th>Proveedor</th><th>Monto</th></tr></thead>
                        <tbody>
                          {campDetalle.gastos.map(g => (
                            <tr key={g.id}>
                              <td className="text-xs text-gray-400">{g.fecha?.slice(0,10).split('-').reverse().join('/')}</td>
                              <td className="text-white text-xs font-medium">{g.concepto}</td>
                              <td className="text-xs text-gray-400">{g.proveedor||'—'}</td>
                              <td className="font-bold text-xs" style={{ color:BRAND }}>{fmtPesos(g.monto)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="card">
                  <div className="section-header mb-3">
                    <h2>Clientes — Preventas vinculadas</h2>
                    <div className="flex items-center gap-3">
                      <span className="text-xs" style={{ color:'#9ca3af' }}>Resultado bruto: <span className="font-bold text-white">{fmtPesos(res)}</span></span>
                      {roi && <span className="text-xs" style={{ color:'#6b7280' }}>S/gest: {roi}%</span>}
                    {roiConGest && <span className="text-xs font-black px-3 py-1 rounded-lg" style={{ background:parseFloat(roiConGest)>0?'#1a2e00':'#2e0000', color:parseFloat(roiConGest)>0?BRAND:'#ef4444' }}>ROI c/gest: {roiConGest}%</span>}
                    </div>
                  </div>
                  {pvC > 0 ? (
                    <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
                      <table className="dark-table">
                        <thead><tr><th>PV</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Match</th><th>Margen Bruto</th><th>Bonif. Terminal</th><th>Result. Bruto</th></tr></thead>
                        <tbody>
                          {campDetalle.preventas.map(v => (
                            <tr key={v.id}>
                              <td className="font-mono text-xs" style={{ color:BRAND }}>{v.pv_solicitud}</td>
                              <td className="text-xs text-gray-400">{v.fecha?.slice(0,10).split('-').reverse().join('/')}</td>
                              <td className="font-bold text-white text-xs">{v.nombre}</td>
                              <td className="text-xs text-gray-400">{v.vendedor||'—'}</td>
                              <td>{v.metodo_match?<span className="badge badge-green text-xs">{v.metodo_match}</span>:<span className="text-gray-600 text-xs">—</span>}</td>
                              <td className="text-xs font-mono" style={{ color:(v.margen_bruto||0)<0?'#ef4444':'#22c55e' }}>{v.margen_bruto!=null?fmtPesos(v.margen_bruto):'—'}</td>
                              <td className="text-xs font-mono text-white">{v.bonificacion_terminal!=null?fmtPesos(v.bonificacion_terminal):'—'}</td>
                              <td className="text-sm font-black" style={{ color:(v.resultado_bruto||0)>=0?BRAND:'#ef4444' }}>{v.resultado_bruto!=null?fmtPesos(v.resultado_bruto):'—'}</td>
                              <td className="text-xs text-white">{v.gestoria?fmtPesos(v.gestoria):'—'}</td>
                              <td className="text-sm font-black" style={{ color:BRAND }}>{(v.resultado_bruto||v.gestoria)?fmtPesos((v.resultado_bruto||0)+(v.gestoria||0)):'—'}</td>
                            </tr>
                          ))}
                          <tr style={{ background:'#0a0a0a', borderTop:'1px solid #2a2a2a' }}>
                            <td colSpan={5} className="font-bold text-xs text-white">TOTAL</td>
                            <td></td>
                            <td className="font-bold text-xs text-white">{fmtPesos(campDetalle.preventas.reduce((s,v)=>s+(v.bonificacion_terminal||0),0))}</td>
                            <td className="font-black text-sm" style={{ color:res>=0?BRAND:'#ef4444' }}>{fmtPesos(res)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-xs py-4 text-center" style={{ color:'#4b5563' }}>Sin preventas vinculadas.</div>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      )}

            {/* TABLA POR MARCA + TORTAS */}
      <div className="grid gap-4" style={{ gridTemplateColumns:'1.2fr 1fr 1fr' }}>

        {/* Tabla por marca */}
        <div className="card">
          <div className="section-header"><h2>Por marca</h2></div>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: GRAY3 }}>
            <table className="dark-table">
              <thead>
                <tr>
                  <th>Marca</th>
                  <th>Leads</th>
                  <th>Preventas</th>
                  <th>Con lead</th>
                  <th>Conv.</th>
                </tr>
              </thead>
              <tbody>
                {porMarca.map(m => (
                  <tr key={m.marca}>
                    <td className="font-bold text-white text-xs">{m.marca}</td>
                    <td className="text-xs" style={{ color:'#9ca3af' }}>{fmt(m.leads)}</td>
                    <td className="text-xs font-bold" style={{ color: BRAND }}>{fmt(m.ventas)}</td>
                    <td className="text-xs" style={{ color: BRAND }}>{fmt(m.conLead)}</td>
                    <td className="text-xs font-bold" style={{ color: m.ventas > 0 && m.conLead/m.ventas > 0.4 ? BRAND : '#6b7280' }}>
                      {fmtPct(m.conLead, m.ventas)}
                    </td>
                  </tr>
                ))}
                {porMarca.length > 0 && (
                  <tr style={{ borderTop:'1px solid #2a2a2a', background:'#0a0a0a' }}>
                    <td className="text-xs font-black text-white">TOTAL</td>
                    <td className="text-xs font-bold" style={{ color:'#9ca3af' }}>{fmt(porMarca.reduce((a,b)=>a+b.leads,0))}</td>
                    <td className="text-xs font-black" style={{ color: BRAND }}>{fmt(porMarca.reduce((a,b)=>a+b.ventas,0))}</td>
                    <td className="text-xs font-black" style={{ color: BRAND }}>{fmt(porMarca.reduce((a,b)=>a+b.conLead,0))}</td>
                    <td className="text-xs font-black" style={{ color: BRAND }}>
                      {fmtPct(porMarca.reduce((a,b)=>a+b.conLead,0), porMarca.reduce((a,b)=>a+b.ventas,0))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Torta Ventas */}
        <div className="card">
          <div className="section-header"><h2>Preventas por marca</h2></div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieMarcas} cx="50%" cy="50%" outerRadius={80} innerRadius={35}
                dataKey="value" nameKey="name" paddingAngle={2}>
                {pieMarcas.map((_,i) => <Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}
              </Pie>
              <Tooltip content={<TipCustom />} />
              <Legend content={<PieLegendCustom />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Conversión por marca — barras */}
        <div className="card">
          <div className="section-header"><h2>Conversión por marca</h2></div>
          <div className="space-y-2 mt-1">
            {porMarca.filter(m => m.ventas > 0).map((m,i) => {
              const p = m.ventas > 0 ? (m.conLead/m.ventas*100).toFixed(1) : 0
              return (
                <div key={m.marca}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-white">{m.marca}</span>
                    <span style={{ color: BRAND, fontWeight:700 }}>{p}%</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background:'#1f1f1f' }}>
                    <div className="h-2 rounded-full" style={{ width: p+'%', background: PALETTE[i%PALETTE.length] }}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* HISTÓRICO */}
      <div className="card">
        <div className="section-header">
          <h2>Histórico mensual — Leads vs Preventas</h2>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={historico} margin={{ left:0, right:16, top:8, bottom:0 }}>
            <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill:'#6b7280', fontSize:10 }} />
            <YAxis tick={{ fill:'#6b7280', fontSize:10 }} />
            <Tooltip content={<TipCustom />} />
            <Legend wrapperStyle={{ fontSize:11, color:'#9ca3af' }} />
            <Line type="monotone" dataKey="ventas"  name="Preventas"       stroke={BRAND}    strokeWidth={2} dot={{ fill: BRAND, r:3 }} />
            <Line type="monotone" dataKey="conLead" name="Con lead"     stroke="#5f7200"  strokeWidth={2} dot={{ fill:'#5f7200', r:3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ORIGEN DE LEADS */}
      <div className="card">
        <div className="section-header">
          <h2>Origen de leads</h2>
          <span className="count-badge">{origenLeads.reduce((s,o)=>s+o.leads,0).toLocaleString('es-AR')} leads</span>
        </div>
        <div className="space-y-2 mt-2">
          {origenLeads.map((o, i) => {
            const max = origenLeads[0]?.leads || 1
            const pctBar = Math.round(o.leads * 100 / max)
            const pctTotal = origenLeads.reduce((s,x)=>s+x.leads,0)
            const pctOf = Math.round(o.leads * 100 / (pctTotal||1))
            return (
              <div key={o.nombre}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-white">{o.nombre}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: BRAND }}>{o.leads.toLocaleString('es-AR')}</span>
                    <span className="text-xs" style={{ color:'#4b5563' }}>({pctOf}%)</span>
                  </div>
                </div>
                <div className="h-2 rounded-full" style={{ background:'#1f1f1f' }}>
                  <div className="h-2 rounded-full transition-all"
                    style={{ width: pctBar+'%', background: PALETTE[i % PALETTE.length] }}/>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* TABLA CAMPAÑAS */}
      <div className="card">
        <div className="section-header">
          <h2>Leads por campaña</h2>
          <span className="count-badge">{campFiltered.length} campañas con conversiones</span>
        </div>
        <div className="filter-results mb-3">
          {campFiltered.length} campañas con <span>{fmt(campFiltered.reduce((a,b)=>a+b.ventas,0))}</span> preventas y <span>{fmt(campFiltered.reduce((a,b)=>a+b.leads,0))}</span> leads
        </div>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: GRAY3 }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Marca</th>
                <th>Rubro</th>
                <th>Leads</th>
                <th>Preventas</th>
                <th>% Conv.</th>
                <th style={{ width:140 }}>Volumen</th>
              </tr>
            </thead>
            <tbody>
              {campFiltered.map((c,i) => {
                const maxV  = campFiltered[0] ? campFiltered[0].ventas : 1
                const p     = c.leads > 0 ? Math.round(c.ventas*100/c.leads) : 0
                const barW  = Math.round(c.ventas*100/maxV)
                return (
                  <tr key={c.codigo}>
                    <td className="font-medium text-white text-xs">{c.nombre}</td>
                    <td className="text-xs" style={{ color:'#9ca3af' }}>{c.marca}</td>
                    <td><span className="badge badge-gray" style={{ fontSize:'0.6rem' }}>{c.rubro}</span></td>
                    <td className="text-xs" style={{ color:'#9ca3af' }}>{fmt(c.leads)}</td>
                    <td className="font-bold text-xs" style={{ color: BRAND }}>{fmt(c.ventas)}</td>
                    <td className="font-bold text-xs" style={{ color: p > 10 ? BRAND : '#9ca3af' }}>{p}%</td>
                    <td>
                      <div className="h-2 rounded-full" style={{ background:'#1f1f1f' }}>
                        <div className="h-2 rounded-full" style={{ width:barW+'%', background: PALETTE[i%PALETTE.length] }}/>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
