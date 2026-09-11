import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts'

const BRAND   = '#B5E000'
const PALETTE = ['#B5E000','#8ca800','#5f7200','#d4f000','#3d5200','#a3c200','#6b8a00','#e8ff4d']
const fmt     = n => (n||0).toLocaleString('es-AR')
const pct     = (a,b) => b > 0 ? Math.round(a*100/b) : 0

function fixLabel(name) {
  if (!name) return 'SIN DATO'
  return name.replace('_',' ').toUpperCase()
}

const Tip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
      <div style={{ color:'#fff', fontWeight:'bold', marginBottom:4 }}>{payload[0].name}</div>
      <div style={{ color: BRAND }}>{fmt(payload[0].value)} ventas</div>
      {/* LEADS POR CAMPAÑA */}
      <div className="card">
        <div className="section-header">
          <h2>Leads por campaña</h2>
          <span className="count-badge">{campanaLeads.length} campañas activas</span>
        </div>

        {/* Filtros */}
        <div className="filter-bar" style={{ marginBottom:16 }}>
          <select className="input-dark" style={{ width:160 }} value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}>
            <option value="">Marca: todas</option>
            {[...new Set(campanaLeads.map(c => c.marca).filter(m => m !== '-'))].sort().map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="filter-sep"/>
          <select className="input-dark" style={{ width:160 }} value={filtroRubro} onChange={e => setFiltroRubro(e.target.value)}>
            <option value="">Rubro: todos</option>
            {[...new Set(campanaLeads.map(c => c.rubro).filter(r => r !== '-'))].sort().map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="filter-sep"/>
          <button onClick={() => { setFiltroMarca(''); setFiltroRubro('') }} className="btn-ghost text-xs">Limpiar</button>
        </div>

        {(() => {
          const filtered = campanaLeads.filter(c =>
            (!filtroMarca || c.marca === filtroMarca) &&
            (!filtroRubro || c.rubro === filtroRubro)
          )
          const maxLeads = filtered[0] ? filtered[0].leads : 1
          const totalLeads = filtered.reduce((a,b) => a + b.leads, 0)
          return (
            <>
              <div className="filter-results mb-4">
                <span>{filtered.length}</span> campañas con <span>{fmt(totalLeads)}</span> leads en total
                {filtroMarca && <span> - Marca: <span>{filtroMarca}</span></span>}
                {filtroRubro && <span> - Rubro: <span>{filtroRubro}</span></span>}
              </div>
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
                <table className="dark-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Campaña</th>
                      <th>Marca</th>
                      <th>Rubro</th>
                      <th>Leads</th>
                      <th style={{ width:200 }}>Volumen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c,i) => {
                      const barW = Math.round((c.leads / maxLeads) * 100)
                      const pctTotal = fmt(Math.round((c.leads / totalLeads) * 100))
                      return (
                        <tr key={c.codigo}>
                          <td>
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                              style={{ background:'#1a2e00', color: BRAND }}>
                              [{c.codigo}]
                            </span>
                          </td>
                          <td className="font-medium text-white text-xs">{c.nombre}</td>
                          <td className="text-xs" style={{ color:'#9ca3af' }}>{c.marca}</td>
                          <td>
                            <span className="badge badge-gray" style={{ fontSize:'0.6rem' }}>{c.rubro}</span>
                          </td>
                          <td>
                            <span className="font-bold text-xs" style={{ color: BRAND }}>{fmt(c.leads)}</span>
                            <span className="text-xs ml-1" style={{ color:'#4b5563' }}>({pctTotal}%)</span>
                          </td>
                          <td>
                            <div className="h-2 rounded-full" style={{ background:'#1f1f1f' }}>
                              <div className="h-2 rounded-full transition-all"
                                style={{ width: barW + '%', background: PALETTE[i % PALETTE.length] }}/>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        })()}
      </div>

    </div>
  )
}

const PieLegend = ({ payload }) => (
  <div style={{ display:'flex', flexWrap:'wrap', gap:6, justifyContent:'center', marginTop:8 }}>
    {payload.map((p,i) => (
      <div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11 }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background: p.color, flexShrink:0 }}/>
        <span style={{ color:'#9ca3af' }}>{p.value}</span>
      </div>
    ))}
  </div>
)

export default function Dashboard() {
  const [desde,    setDesde]    = useState('')
  const [hasta,    setHasta]    = useState('')
  const [stats,    setStats]    = useState(null)
  const [metodos,  setMetodos]  = useState([])
  const [canales,  setCanales]  = useState([])
  const [marcas,   setMarcas]   = useState([])
  const [marcaDet,     setMarcaDet]     = useState([])
  const [campanaLeads, setCampanaLeads] = useState([])
  const [filtroMarca,  setFiltroMarca]  = useState('')
  const [filtroRubro,  setFiltroRubro]  = useState('')
  const [loading,  setLoading]  = useState(true)

  const applyFiltro = useCallback(q => {
    if (desde) q = q.gte('fecha', desde)
    if (hasta) q = q.lte('fecha', hasta)
    return q
  }, [desde, hasta])

  const load = useCallback(async () => {
    setLoading(true)
    const [
      { count: totalVentas },
      { count: ventasConLead },
      { count: totalLeads },
      { count: totalEntregas },
    ] = await Promise.all([
      applyFiltro(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})),
      applyFiltro(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})).not('lead_id','is',null),
      supabase.from('mkt_leads').select('*',{count:'exact',head:true}),
      applyFiltro(supabase.from('mkt_entregas').select('*',{count:'exact',head:true})).not('venta_id','is',null),
    ])
    setStats({ totalVentas, ventasConLead, totalLeads, totalEntregas })

    // Métodos de match
    const { data: vMatch } = await applyFiltro(
      supabase.from('mkt_ventas').select('metodo_match').not('lead_id','is',null)
    ).limit(10000)
    if (vMatch) {
      const map = {}
      vMatch.forEach(v => { if (v.metodo_match) map[v.metodo_match] = (map[v.metodo_match]||0)+1 })
      setMetodos(Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({ name: fixLabel(name), value })))
    }

    // Canales (pie chart)
    const { data: vCanal } = await applyFiltro(
      supabase.from('mkt_ventas')
        .select('mkt_leads!mkt_ventas_lead_id_fkey(canal)')
        .not('lead_id','is',null)
    ).limit(10000)
    if (vCanal) {
      const map = {}
      vCanal.forEach(v => {
        const c = (v.mkt_leads && v.mkt_leads.canal) ? v.mkt_leads.canal : 'Sin canal'
        map[c] = (map[c]||0)+1
      })
      setCanales(Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,value])=>({ name, value })))
    }

    // Marcas con detalle de leads
    const { data: vMarca } = await applyFiltro(supabase.from('mkt_ventas').select('marca,lead_id').not('marca','is',null))
    if (vMarca) {
      const map = {}
      vMarca.forEach(v => {
        if (!map[v.marca]) map[v.marca] = { total:0, conLead:0 }
        map[v.marca].total++
        if (v.lead_id) map[v.marca].conLead++
      })
      const arr = Object.entries(map)
        .sort((a,b) => b[1].total - a[1].total)
        .map(([name, d]) => ({ name, total: d.total, conLead: d.conLead, sinLead: d.total - d.conLead }))
      setMarcas(arr.map(m => ({ name: m.name, value: m.total })))
      setMarcaDet(arr)
    }

    // Leads por campaña
    const { data: lCamp } = await supabase.from('mkt_leads')
      .select('codigo_campana, mkt_campanas!mkt_leads_campana_id_fkey(nombre,marca,rubro)')
      .not('codigo_campana','is',null)
      .limit(50000)
    if (lCamp) {
      const map = {}
      lCamp.forEach(l => {
        const code = l.codigo_campana
        if (!map[code]) map[code] = {
          codigo: code,
          nombre: (l.mkt_campanas && l.mkt_campanas.nombre) ? l.mkt_campanas.nombre : code,
          marca:  (l.mkt_campanas && l.mkt_campanas.marca)  ? l.mkt_campanas.marca  : '-',
          rubro:  (l.mkt_campanas && l.mkt_campanas.rubro)  ? l.mkt_campanas.rubro  : '-',
          leads: 0
        }
        map[code].leads++
      })
      setCampanaLeads(Object.values(map).sort((a,b) => b.leads - a.leads))
    }

    setLoading(false)
  }, [applyFiltro])

  useEffect(() => { load() }, [load])

  const sinMatch   = (stats ? stats.totalVentas : 0) - (stats ? stats.ventasConLead : 0)
  const pctDigital = pct(stats ? stats.ventasConLead : 0, stats ? stats.totalVentas : 0)
  const totalVent  = stats ? stats.ventasConLead : 0

  return (
    <div className="space-y-5">

      {/* FILTRO HORIZONTAL */}
      <div className="card">
        <div className="filter-bar" style={{ marginBottom:0 }}>
          <span className="text-xs text-gray-500 flex-shrink-0">Filtrar por fecha:</span>
          <div className="filter-sep"/>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-500">Desde</span>
            <input type="date" className="input-dark" style={{ width:150 }}
              value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-500">Hasta</span>
            <input type="date" className="input-dark" style={{ width:150 }}
              value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <div className="filter-sep"/>
          <div className="flex gap-2 flex-shrink-0">
            {[
              { label:'Mes actual', f:() => { const d=new Date(); const m=String(d.getMonth()+1).padStart(2,'0'); setDesde(d.getFullYear()+'-'+m+'-01'); setHasta(d.getFullYear()+'-'+m+'-31') }},
              { label:'Trimestre', f:() => { const d=new Date(); const m=d.getMonth(); const q=Math.floor(m/3); const y=d.getFullYear(); setDesde(y+'-'+String(q*3+1).padStart(2,'0')+'-01'); setHasta(y+'-'+String(q*3+3).padStart(2,'0')+'-31') }},
              { label:'Anio',      f:() => { const y=new Date().getFullYear(); setDesde(y+'-01-01'); setHasta(y+'-12-31') }},
            ].map(p => (
              <button key={p.label} onClick={p.f}
                className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                style={{ background:'#1a2e00', color: BRAND, border:'1px solid #2a3d00' }}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="filter-sep"/>
          <button onClick={() => { setDesde(''); setHasta('') }} className="btn-ghost text-xs flex-shrink-0">
            Limpiar
          </button>
        </div>
        {(desde || hasta) && (
          <div className="text-xs mt-2" style={{ color:'#6b7280' }}>
            {desde ? 'Desde: ' + desde.split('-').reverse().join('/') : ''}
            {desde && hasta ? '  -  ' : ''}
            {hasta ? 'Hasta: ' + hasta.split('-').reverse().join('/') : ''}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:'Total ventas',       value: fmt(stats ? stats.totalVentas : 0),    sub:'en el periodo' },
          { label:'Con lead digital',   value: fmt(stats ? stats.ventasConLead : 0),  sub: pctDigital + '% del total', accent:true },
          { label:'Sin lead digital',   value: fmt(sinMatch),                          sub:'otro origen' },
          { label:'Entregas vinculadas',value: fmt(stats ? stats.totalEntregas : 0),  sub:'PV con entrega' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-4 border" style={{ background: k.accent ? '#1a2e00' : '#111', borderColor: k.accent ? BRAND : '#2a2a2a' }}>
            <div className="text-2xl font-black" style={{ color: k.accent ? BRAND : '#fff' }}>{loading ? '-' : k.value}</div>
            <div className="text-xs font-bold uppercase mt-1" style={{ color: k.accent ? BRAND : '#4b5563' }}>{k.label}</div>
            <div className="text-xs mt-0.5" style={{ color:'#374151' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* GRAFICOS FILA 1: Metodos + Canal grande */}
      <div className="grid gap-4" style={{ gridTemplateColumns:'1fr 2fr' }}>

        {/* Como se vincularon */}
        <div className="card">
          <div className="section-header">
            <h2>Como se vincularon</h2>
            <span className="count-badge">{fmt(totalVent)} ventas</span>
          </div>
          <div className="space-y-3 mt-2">
            {metodos.map((m,i) => {
              const p = pct(m.value, totalVent)
              return (
                <div key={m.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-bold" style={{ color: BRAND }}>{m.name}</span>
                    <span style={{ color:'#9ca3af' }}>{fmt(m.value)} <span style={{ color:'#4b5563' }}>({p}%)</span></span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background:'#2a2a2a' }}>
                    <div className="h-2 rounded-full" style={{ width: p + '%', background: PALETTE[i % PALETTE.length] }}/>
                  </div>
                </div>
              )
            })}
            {!loading && metodos.length === 0 && (
              <p className="text-xs" style={{ color:'#4b5563' }}>Sin datos. Ejecuta el cruce en Asignados.</p>
            )}
          </div>
        </div>

        {/* Canal de captacion - Torta grande */}
        <div className="card">
          <div className="section-header">
            <h2>Canal de captacion</h2>
            <span className="count-badge">{fmt(totalVent)} ventas digitales</span>
          </div>
          {canales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={canales}
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={40}
                  dataKey="value"
                  nameKey="name"
                  paddingAngle={2}>
                  {canales.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip content={<Tip />} />
                <Legend content={<PieLegend />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48">
              <p className="text-xs" style={{ color:'#4b5563' }}>Sin datos de canal disponibles.</p>
            </div>
          )}
        </div>
      </div>

      {/* GRAFICOS FILA 2: Marcas + Tabla */}
      <div className="grid grid-cols-2 gap-4">

        {/* Barras horizontales por marca con leads vs sin leads */}
        <div className="card">
          <div className="section-header">
            <h2>Ventas por marca</h2>
          </div>
          <div className="flex gap-4 mb-3">
            <div className="flex items-center gap-1.5 text-xs" style={{ color:'#9ca3af' }}>
              <div style={{ width:10, height:10, borderRadius:2, background: BRAND }}/>
              Con lead
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color:'#9ca3af' }}>
              <div style={{ width:10, height:10, borderRadius:2, background:'#2a2a2a' }}/>
              Sin lead
            </div>
          </div>
          {marcaDet.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, marcaDet.length * 48)}>
              <BarChart data={marcaDet} layout="vertical" margin={{ left:8, right:24, top:0, bottom:0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill:'#9ca3af', fontSize:11, fontWeight:'bold' }} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null
                  const total = payload.reduce((a,b) => a + (b.value||0), 0)
                  return (
                    <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
                      <div style={{ color:'#fff', fontWeight:'bold', marginBottom:4 }}>{label}</div>
                      {payload.map((p,i) => <div key={i} style={{ color: p.fill === BRAND ? BRAND : '#6b7280' }}>{p.name}: {fmt(p.value)}</div>)}
                      <div style={{ color:'#4b5563', marginTop:4, borderTop:'1px solid #2a2a2a', paddingTop:4 }}>Total: {fmt(total)}</div>
                    </div>
                  )
                }} cursor={{ fill:'#ffffff05' }} />
                <Bar dataKey="conLead" name="Con lead" stackId="a" fill={BRAND} radius={[0,0,0,0]} />
                <Bar dataKey="sinLead" name="Sin lead"  stackId="a" fill="#2a3d00" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs" style={{ color:'#4b5563' }}>Sin datos.</p>
            </div>
          )}
        </div>

        {/* Tabla resumen */}
        <div className="card">
          <div className="section-header"><h2>Resumen canal</h2></div>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
            <table className="dark-table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Ventas</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {canales.map((c,i) => {
                  const p = pct(c.value, totalVent)
                  return (
                    <tr key={c.name}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div style={{ width:8, height:8, borderRadius:'50%', background: PALETTE[i % PALETTE.length], flexShrink:0 }}/>
                          <span className="text-white text-xs">{c.name}</span>
                        </div>
                      </td>
                      <td className="font-bold text-xs" style={{ color: BRAND }}>{fmt(c.value)}</td>
                      <td className="text-xs" style={{ color:'#6b7280' }}>{p}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* LEADS POR CAMPAÑA */}
      <div className="card">
        <div className="section-header">
          <h2>Leads por campaña</h2>
          <span className="count-badge">{campanaLeads.length} campañas activas</span>
        </div>

        {/* Filtros */}
        <div className="filter-bar" style={{ marginBottom:16 }}>
          <select className="input-dark" style={{ width:160 }} value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}>
            <option value="">Marca: todas</option>
            {[...new Set(campanaLeads.map(c => c.marca).filter(m => m !== '-'))].sort().map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="filter-sep"/>
          <select className="input-dark" style={{ width:160 }} value={filtroRubro} onChange={e => setFiltroRubro(e.target.value)}>
            <option value="">Rubro: todos</option>
            {[...new Set(campanaLeads.map(c => c.rubro).filter(r => r !== '-'))].sort().map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="filter-sep"/>
          <button onClick={() => { setFiltroMarca(''); setFiltroRubro('') }} className="btn-ghost text-xs">Limpiar</button>
        </div>

        {(() => {
          const filtered = campanaLeads.filter(c =>
            (!filtroMarca || c.marca === filtroMarca) &&
            (!filtroRubro || c.rubro === filtroRubro)
          )
          const maxLeads = filtered[0] ? filtered[0].leads : 1
          const totalLeads = filtered.reduce((a,b) => a + b.leads, 0)
          return (
            <>
              <div className="filter-results mb-4">
                <span>{filtered.length}</span> campañas con <span>{fmt(totalLeads)}</span> leads en total
                {filtroMarca && <span> - Marca: <span>{filtroMarca}</span></span>}
                {filtroRubro && <span> - Rubro: <span>{filtroRubro}</span></span>}
              </div>
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
                <table className="dark-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Campaña</th>
                      <th>Marca</th>
                      <th>Rubro</th>
                      <th>Leads</th>
                      <th style={{ width:200 }}>Volumen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c,i) => {
                      const barW = Math.round((c.leads / maxLeads) * 100)
                      const pctTotal = fmt(Math.round((c.leads / totalLeads) * 100))
                      return (
                        <tr key={c.codigo}>
                          <td>
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                              style={{ background:'#1a2e00', color: BRAND }}>
                              [{c.codigo}]
                            </span>
                          </td>
                          <td className="font-medium text-white text-xs">{c.nombre}</td>
                          <td className="text-xs" style={{ color:'#9ca3af' }}>{c.marca}</td>
                          <td>
                            <span className="badge badge-gray" style={{ fontSize:'0.6rem' }}>{c.rubro}</span>
                          </td>
                          <td>
                            <span className="font-bold text-xs" style={{ color: BRAND }}>{fmt(c.leads)}</span>
                            <span className="text-xs ml-1" style={{ color:'#4b5563' }}>({pctTotal}%)</span>
                          </td>
                          <td>
                            <div className="h-2 rounded-full" style={{ background:'#1f1f1f' }}>
                              <div className="h-2 rounded-full transition-all"
                                style={{ width: barW + '%', background: PALETTE[i % PALETTE.length] }}/>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        })()}
      </div>

    </div>
  )
}
