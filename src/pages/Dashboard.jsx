import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

// ── Paleta GRUPO RANDAZZO ──────────────────────────────────
const BRAND   = '#B5E000'
const BRAND2  = '#8ca800'
const BRAND3  = '#5f7200'
const DARK    = '#111111'
const GRAY1   = '#9ca3af'
const GRAY2   = '#4b5563'
const GRAY3   = '#2a2a2a'
const PALETTE = [BRAND, BRAND2, BRAND3, '#d4f000', '#e8ff4d', '#a3c200', '#6b8a00', '#3d5200']

const fmt  = n  => (n||0).toLocaleString('es-AR')
const pct  = (a,b) => b > 0 ? Math.round(a/b*100) + '%' : '0%'
const fmtM = m  => new Date(m+'-15').toLocaleString('es-AR',{month:'short',year:'2-digit'})

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background:'#1a1a1a', border:`1px solid ${GRAY3}` }}>
      <div className="font-bold text-white mb-1">{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color: BRAND }}>{p.name}: {fmt(p.value)}</div>)}
    </div>
  )
}

export default function Dashboard() {
  const [meses,       setMeses]       = useState([])
  const [selectedMes, setSelectedMes] = useState([]) // multi-select
  const [stats,       setStats]       = useState(null)
  const [origenes,    setOrigenes]    = useState([])
  const [metodos,     setMetodos]     = useState([])
  const [canales,     setCanales]     = useState([])
  const [marcas,      setMarcas]      = useState([])
  const [loading,     setLoading]     = useState(true)

  // Cargar meses disponibles
  useEffect(() => {
    supabase.from('mkt_ventas').select('fecha').not('fecha','is',null)
      .then(({ data }) => {
        if (!data) return
        const u = [...new Set(data.map(r => r.fecha?.slice(0,7)).filter(Boolean))].sort().reverse()
        setMeses(u)
      })
  }, [])

  const applyMesFiltro = useCallback((q) => {
    if (selectedMes.length === 0) return q
    if (selectedMes.length === 1) {
      return q.gte('fecha', selectedMes[0]+'-01').lte('fecha', selectedMes[0]+'-31')
    }
    const sorted = [...selectedMes].sort()
    return q.gte('fecha', sorted[0]+'-01').lte('fecha', sorted[sorted.length-1]+'-31')
  }, [selectedMes])

  const load = useCallback(async () => {
    setLoading(true)

    // KPIs
    const [
      { count: totalVentas },
      { count: ventasConLead },
      { count: totalLeads },
      { count: totalEntregas },
    ] = await Promise.all([
      applyMesFiltro(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})),
      applyMesFiltro(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})).not('lead_id','is',null),
      supabase.from('mkt_leads').select('*',{count:'exact',head:true}),
      applyMesFiltro(supabase.from('mkt_entregas').select('*',{count:'exact',head:true})).not('venta_id','is',null),
    ])
    setStats({ totalVentas, ventasConLead, totalLeads, totalEntregas })

    // Orígenes y métodos — desde ventas filtradas
    const { data: ventasData } = await applyMesFiltro(
      supabase.from('mkt_ventas').select('metodo_match,lead_origen').not('lead_id','is',null)
    ).limit(10000)

    if (ventasData) {
      const origenMap = {}; const metodosMap = {}
      ventasData.forEach(v => {
        const origen = v.lead_origen || 'Sin origen'
        origenMap[origen] = (origenMap[origen]||0)+1
        if (v.metodo_match) metodosMap[v.metodo_match] = (metodosMap[v.metodo_match]||0)+1
      })
      const sort = obj => Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}))
      setOrigenes(sort(origenMap))
      setMetodos(sort(metodosMap))
    }

    // Canales — solo leads Internet/llamadas
    const { data: vDigital } = await applyMesFiltro(
      supabase.from('mkt_ventas')
        .select('mkt_leads!mkt_ventas_lead_id_fkey(canal)')
        .not('lead_id','is',null)
        .not('lead_origen','eq','De paso')
    ).limit(5000)

    if (vDigital) {
      const canalMap = {}
      vDigital.forEach(v => {
        const c = v.mkt_leads?.canal || 'Sin canal'
        canalMap[c] = (canalMap[c]||0)+1
      })
      setCanales(Object.entries(canalMap).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,value])=>({name,value})))
    }

    // Marcas
    const { data: marcaData } = await applyMesFiltro(
      supabase.from('mkt_ventas').select('marca').not('marca','is',null)
    )
    if (marcaData) {
      const map = {}
      marcaData.forEach(v => { map[v.marca]=(map[v.marca]||0)+1 })
      setMarcas(Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value})))
    }

    setLoading(false)
  }, [applyMesFiltro])

  useEffect(() => { load() }, [load])

  function toggleMes(m) {
    setSelectedMes(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    )
  }

  const sinMatch = (stats?.totalVentas||0) - (stats?.ventasConLead||0)
  const pctMatch = pct(stats?.ventasConLead, stats?.totalVentas)
  const periodoLabel = selectedMes.length === 0
    ? 'Todo el período'
    : selectedMes.length === 1
      ? fmtM(selectedMes[0])
      : selectedMes.map(fmtM).join(', ')

  return (
    <div className="space-y-5">

      {/* FILTRO DE MESES */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-white text-sm">Filtro de período</h2>
            <p className="text-xs mt-0.5" style={{ color: GRAY1 }}>Seleccioná uno o más meses para filtrar todos los KPIs</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded" style={{ background: DARK, border:`1px solid ${GRAY3}`, color: GRAY1 }}>
              {periodoLabel}
            </span>
            {selectedMes.length > 0 && (
              <button onClick={() => setSelectedMes([])}
                className="text-xs px-2 py-1 rounded" style={{ background:'#1a2e00', color: BRAND, border:`1px solid ${BRAND}` }}>
                Limpiar
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {meses.map(m => (
            <button key={m} onClick={() => toggleMes(m)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{
                background: selectedMes.includes(m) ? BRAND : DARK,
                color:      selectedMes.includes(m) ? '#000' : GRAY1,
                border:     `1px solid ${selectedMes.includes(m) ? BRAND : GRAY3}`,
              }}>
              {new Date(m+'-15').toLocaleString('es-AR',{month:'long',year:'numeric'})}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label:'Total ventas',      value: fmt(stats?.totalVentas),    sub:'en el período' },
          { label:'Con lead digital',  value: fmt(stats?.ventasConLead),  sub: pctMatch + ' del total', accent: true },
          { label:'Sin lead digital',  value: fmt(sinMatch),              sub:'otro origen' },
          { label:'Entregas vinculadas', value: fmt(stats?.totalEntregas), sub:'PV con entrega' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-4 border" style={{ background: k.accent ? '#1a2e00' : DARK, borderColor: k.accent ? BRAND : GRAY3 }}>
            <div className="text-2xl font-black" style={{ color: k.accent ? BRAND : '#fff' }}>{loading ? '—' : k.value}</div>
            <div className="text-xs font-bold uppercase mt-1" style={{ color: k.accent ? BRAND : GRAY2 }}>{k.label}</div>
            <div className="text-xs mt-0.5" style={{ color: GRAY2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* MÉTODOS + ORÍGENES */}
      <div className="grid grid-cols-2 gap-4">

        <div className="card">
          <div className="section-header">
            <h2>Cómo se vincularon</h2>
            <span className="count-badge">{fmt(stats?.ventasConLead)} ventas</span>
          </div>
          <div className="space-y-2">
            {metodos.map((m,i) => {
              const p = stats?.ventasConLead > 0 ? Math.round(m.value/stats.ventasConLead*100) : 0
              return (
                <div key={m.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-mono" style={{ color: BRAND }}>{m.name}</span>
                    <span style={{ color: GRAY1 }}>{fmt(m.value)} <span style={{ color: GRAY2 }}>({p}%)</span></span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: GRAY3 }}>
                    <div className="h-1.5 rounded-full" style={{ width: p+'%', background: PALETTE[i%PALETTE.length] }}/>
                  </div>
                </div>
              )
            })}
            {!loading && metodos.length === 0 && <p className="text-xs" style={{ color: GRAY2 }}>Sin datos. Ejecutá el cruce en Asignados.</p>}
          </div>
        </div>

        <div className="card">
          <div className="section-header">
            <h2>Origen de leads vinculados</h2>
          </div>
          <div className="space-y-2">
            {origenes.map((o,i) => {
              const max = origenes[0]?.value || 1
              const p   = Math.round(o.value/max*100)
              return (
                <div key={o.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: '#d1d5db' }} className="truncate max-w-44" title={o.name}>{o.name}</span>
                    <span style={{ color: GRAY1 }} className="ml-2 flex-shrink-0">{fmt(o.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: GRAY3 }}>
                    <div className="h-1.5 rounded-full" style={{ width: p+'%', background: PALETTE[i%PALETTE.length] }}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* CANAL + MARCA */}
      <div className="grid grid-cols-2 gap-4">

        <div className="card">
          <div className="section-header">
            <h2>Canal de captación</h2>
            <span className="count-badge">Top 8</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={canales} layout="vertical" margin={{ left:8, right:8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill: GRAY1, fontSize:10 }} />
              <Tooltip content={<Tip />} cursor={{ fill:'#ffffff08' }} />
              <Bar dataKey="value" name="Ventas" radius={[0,4,4,0]}>
                {canales.map((_,i) => <Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="section-header">
            <h2>Ventas por marca</h2>
          </div>
          <div className="space-y-2 mt-2">
            {marcas.map((m,i) => {
              const max = marcas[0]?.value || 1
              const p   = Math.round(m.value/max*100)
              const tot = marcas.reduce((a,b)=>a+b.value,0)
              return (
                <div key={m.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color:'#d1d5db' }}>{m.name}</span>
                    <span style={{ color: GRAY1 }}>{fmt(m.value)} <span style={{ color: GRAY2 }}>({pct(m.value,tot)})</span></span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: GRAY3 }}>
                    <div className="h-2 rounded-full" style={{ width: p+'%', background: PALETTE[i%PALETTE.length] }}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* TABLA DETALLE ORÍGENES */}
      <div className="card">
        <div className="section-header">
          <h2>Ventas por origen — detalle</h2>
          <span className="count-badge">{fmt(stats?.ventasConLead)} con lead</span>
        </div>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: GRAY3 }}>
          <table className="dark-table">
            <thead><tr>
              <th>Origen</th><th>Ventas vinculadas</th><th>% del total matcheado</th><th>Barra</th>
            </tr></thead>
            <tbody>
              {origenes.map((o,i) => {
                const p = stats?.ventasConLead > 0 ? (o.value/stats.ventasConLead*100).toFixed(1) : 0
                return (
                  <tr key={o.name}>
                    <td className="font-medium text-white">{o.name}</td>
                    <td className="font-bold" style={{ color: BRAND }}>{fmt(o.value)}</td>
                    <td style={{ color: GRAY1 }}>{p}%</td>
                    <td style={{ width: 160 }}>
                      <div className="h-1.5 rounded-full" style={{ background: GRAY3 }}>
                        <div className="h-1.5 rounded-full" style={{ width: p+'%', background: PALETTE[i%PALETTE.length] }}/>
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
