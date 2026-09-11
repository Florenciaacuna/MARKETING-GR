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
const fmtPct = (a,b) => b > 0 ? (a * 100 / b).toFixed(1) + '%' : '0%'

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
  const [porMarca,     setPorMarca]     = useState([])
  const [historico,    setHistorico]    = useState([])
  const [campLeads,    setCampLeads]    = useState([])
  const [loading,      setLoading]      = useState(true)

  function toggleMarca(m) {
    setMarcaFiltro(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }
  function toggleRubro(r) {
    setRubroFiltro(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  const load = useCallback(async () => {
    setLoading(true)

    // Build venta filters
    const applyV = q => {
      if (desde) q = q.gte('fecha', desde)
      if (hasta) q = q.lte('fecha', hasta)
      if (marcaFiltro.length > 0) q = q.in('marca', marcaFiltro)
      return q
    }

    // --- KPIs globales ---
    const [
      { count: totalVentas },
      { count: ventasConLead },
      { count: totalLeads },
      { count: totalEntregas },
    ] = await Promise.all([
      applyV(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})),
      applyV(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})).not('lead_id','is',null),
      supabase.from('mkt_leads').select('*',{count:'exact',head:true}),
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

    // --- Leads por campaña ---
    const [{ data: lCamp }, { data: campList }] = await Promise.all([
      supabase.from('mkt_leads').select('codigo_campana').not('codigo_campana','is',null).limit(50000),
      supabase.from('mkt_campanas').select('codigo,nombre,marca,rubro')
    ])
    if (lCamp && campList) {
      const campMap = {}
      campList.forEach(c => { campMap[c.codigo.toLowerCase()] = c })
      const lMap = {}
      lCamp.forEach(l => { const c = (l.codigo_campana||'').toLowerCase(); lMap[c] = (lMap[c]||0)+1 })
      const { data: vCamp } = await applyV(
        supabase.from('mkt_ventas').select('mkt_leads!mkt_ventas_lead_id_fkey(codigo_campana)')
      ).not('lead_id','is',null).limit(10000)
      const vMap = {}
      if (vCamp) vCamp.forEach(v => {
        const c = (v.mkt_leads && v.mkt_leads.codigo_campana) ? v.mkt_leads.codigo_campana.toLowerCase() : null
        if (c) vMap[c] = (vMap[c]||0)+1
      })
      const result = []
      Object.entries(lMap).forEach(([code, leads]) => {
        const camp = campMap[code]
        if (!camp) return
        const ventas = vMap[code] || 0
        if (ventas === 0) return
        result.push({ codigo:code, nombre:camp.nombre, marca:camp.marca, rubro:camp.rubro, leads, ventas })
      })
      setCampLeads(result.sort((a,b) => b.ventas - a.ventas))
    }

    setLoading(false)
  }, [desde, hasta, marcaFiltro, rubroFiltro])

  useEffect(() => { load() }, [load])

  const pctConversion = fmtPct(kpis ? kpis.ventasConLead : 0, kpis ? kpis.totalVentas : 0)
  const pieMarcas     = porMarca.slice(0,8).map((m,i) => ({ name: m.marca, value: m.ventas, leads: m.leads }))
  const pieMarcasL    = porMarca.filter(m => m.leads > 0).slice(0,8).map(m => ({ name: m.marca, value: m.leads }))
  const campFiltered  = rubroFiltro.length > 0 ? campLeads.filter(c => rubroFiltro.includes(c.rubro)) : campLeads

  return (
    <div className="space-y-4">

      {/* FILTROS */}
      <div className="card">
        <div className="filter-bar" style={{ marginBottom:12 }}>
          <span className="text-xs text-gray-500 flex-shrink-0">Fecha:</span>
          <div className="filter-sep"/>
          <DatePicker label="Desde" value={desde} onChange={setDesde} maxDate={hasta||undefined} />
          <DatePicker label="Hasta" value={hasta} onChange={setHasta} minDate={desde||undefined} />
          <div className="filter-sep"/>
          <button onClick={() => { const d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'); setDesde(d.getFullYear()+'-'+m+'-01'); setHasta(d.getFullYear()+'-'+m+'-31') }}
            className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0" style={{ background:'#1a2e00', color:BRAND, border:'1px solid #2a3d00' }}>Mes actual</button>
          <button onClick={() => { const y=new Date().getFullYear(); setDesde(y+'-01-01'); setHasta(y+'-12-31') }}
            className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0" style={{ background:'#1a2e00', color:BRAND, border:'1px solid #2a3d00' }}>Año</button>
          <div className="filter-sep"/>
          <button onClick={() => { setDesde(''); setHasta(''); setMarcaFiltro([]); setRubroFiltro([]) }}
            className="btn-ghost text-xs flex-shrink-0">Limpiar todo</button>
        </div>

        {/* Filtro marca */}
        <div className="mb-3">
          <div className="text-xs text-gray-600 uppercase font-bold mb-2" style={{ letterSpacing:'0.08em' }}>Marca</div>
          <div className="flex flex-wrap gap-2">
            {MARCAS.map(m => (
              <button key={m} onClick={() => toggleMarca(m)}
                className="text-xs px-3 py-1 rounded-lg font-medium transition-all"
                style={{
                  background: marcaFiltro.includes(m) ? BRAND : '#1a1a1a',
                  color:      marcaFiltro.includes(m) ? '#000' : '#6b7280',
                  border:    `1px solid ${marcaFiltro.includes(m) ? BRAND : GRAY3}`
                }}>{m}</button>
            ))}
            {marcaFiltro.length > 0 && (
              <button onClick={() => setMarcaFiltro([])} className="text-xs text-gray-600 hover:text-gray-300">Todas</button>
            )}
          </div>
        </div>

        {/* Filtro rubro */}
        <div>
          <div className="text-xs text-gray-600 uppercase font-bold mb-2" style={{ letterSpacing:'0.08em' }}>Rubro</div>
          <div className="flex flex-wrap gap-2">
            {RUBROS.map(r => (
              <button key={r} onClick={() => toggleRubro(r)}
                className="text-xs px-3 py-1 rounded-lg font-medium transition-all"
                style={{
                  background: rubroFiltro.includes(r) ? BRAND : '#1a1a1a',
                  color:      rubroFiltro.includes(r) ? '#000' : '#6b7280',
                  border:    `1px solid ${rubroFiltro.includes(r) ? BRAND : GRAY3}`
                }}>{r}</button>
            ))}
            {rubroFiltro.length > 0 && (
              <button onClick={() => setRubroFiltro([])} className="text-xs text-gray-600 hover:text-gray-300">Todos</button>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:'LEADS',          value: fmt(kpis ? kpis.totalLeads    : 0), sub:'consultas digitales' },
          { label:'VENTAS',         value: fmt(kpis ? kpis.totalVentas   : 0), sub:'preventas cargadas', accent:true },
          { label:'CON LEAD',       value: fmt(kpis ? kpis.ventasConLead : 0), sub:'origen identificado', accent:true },
          { label:'CONVERSIÓN',     value: pctConversion,                       sub:'ventas / total preventas' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-4 border" style={{ background: k.accent ? '#1a2e00' : '#111', borderColor: k.accent ? BRAND : GRAY3 }}>
            <div className="text-2xl font-black" style={{ color: k.accent ? BRAND : '#fff' }}>{loading ? '—' : k.value}</div>
            <div className="text-xs font-black uppercase mt-1 tracking-widest" style={{ color: k.accent ? BRAND : '#4b5563' }}>{k.label}</div>
            <div className="text-xs mt-0.5" style={{ color:'#374151' }}>{k.sub}</div>
          </div>
        ))}
      </div>

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
                  <th>Ventas</th>
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
          <div className="section-header"><h2>Ventas por marca</h2></div>
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
          <h2>Histórico mensual — Leads vs Ventas</h2>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={historico} margin={{ left:0, right:16, top:8, bottom:0 }}>
            <CartesianGrid stroke="#1f1f1f" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill:'#6b7280', fontSize:10 }} />
            <YAxis tick={{ fill:'#6b7280', fontSize:10 }} />
            <Tooltip content={<TipCustom />} />
            <Legend wrapperStyle={{ fontSize:11, color:'#9ca3af' }} />
            <Line type="monotone" dataKey="ventas"  name="Ventas"       stroke={BRAND}    strokeWidth={2} dot={{ fill: BRAND, r:3 }} />
            <Line type="monotone" dataKey="conLead" name="Con lead"     stroke="#5f7200"  strokeWidth={2} dot={{ fill:'#5f7200', r:3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* TABLA CAMPAÑAS */}
      <div className="card">
        <div className="section-header">
          <h2>Leads por campaña</h2>
          <span className="count-badge">{campFiltered.length} campañas con conversiones</span>
        </div>
        <div className="filter-results mb-3">
          {campFiltered.length} campañas con <span>{fmt(campFiltered.reduce((a,b)=>a+b.ventas,0))}</span> ventas y <span>{fmt(campFiltered.reduce((a,b)=>a+b.leads,0))}</span> leads
        </div>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: GRAY3 }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Marca</th>
                <th>Rubro</th>
                <th>Leads</th>
                <th>Ventas</th>
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
