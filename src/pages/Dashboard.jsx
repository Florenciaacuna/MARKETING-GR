import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const BRAND   = '#B5E000'
const COLORS  = ['#B5E000','#60a5fa','#f59e0b','#f87171','#a78bfa','#34d399','#fb923c','#e879f9']

const fmtNum  = n => (n||0).toLocaleString('es-AR')
const fmtPct  = (a,b) => b > 0 ? Math.round(a/b*100) + '%' : '0%'

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: accent ? '#1a2e00' : '#111', borderColor: accent ? BRAND : '#2a2a2a' }}>
      <div className="text-2xl font-black" style={{ color: accent ? BRAND : '#fff' }}>{value}</div>
      <div className="text-xs font-bold uppercase mt-1" style={{ color: accent ? BRAND : '#6b7280' }}>{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background:'#1a1a1a', border:'1px solid #2a2a2a' }}>
      <div className="font-bold text-white mb-1">{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color: p.fill || p.color }}>{p.name}: {fmtNum(p.value)}</div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [stats,    setStats]    = useState(null)
  const [origenes, setOrigenes] = useState([])
  const [metodos,  setMetodos]  = useState([])
  const [canales,  setCanales]  = useState([])
  const [marcas,   setMarcas]   = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)

      // KPIs globales
      const [
        { count: totalVentas },
        { count: ventasConLead },
        { count: totalLeads },
        { count: leadsConDNI },
        { count: leadsConTel },
      ] = await Promise.all([
        supabase.from('mkt_ventas').select('*', { count:'exact', head:true }),
        supabase.from('mkt_ventas').select('*', { count:'exact', head:true }).not('lead_id','is',null),
        supabase.from('mkt_leads').select('*', { count:'exact', head:true }),
        supabase.from('mkt_leads').select('*', { count:'exact', head:true }).not('dni','is',null),
        supabase.from('mkt_leads').select('*', { count:'exact', head:true }).not('telefono','is',null),
      ])

      setStats({ totalVentas, ventasConLead, totalLeads, leadsConDNI, leadsConTel })

      // Orígenes de las ventas matcheadas (del lead)
      const { data: ventasData } = await supabase.from('mkt_ventas')
        .select('metodo_match, mkt_leads!mkt_ventas_lead_id_fkey(origen, canal, fuente)')
        .not('lead_id','is',null)
        .limit(5000)

      if (ventasData) {
        // Por origen del lead
        const origenMap = {}
        const metodosMap = {}
        const canalMap = {}

        ventasData.forEach(v => {
          const lead = v.mkt_leads
          const origen = lead?.origen || 'Sin origen'
          const metodo = v.metodo_match || 'sin_método'
          const canal  = lead?.canal || 'Sin canal'

          origenMap[origen]  = (origenMap[origen]  || 0) + 1
          metodosMap[metodo] = (metodosMap[metodo] || 0) + 1
          canalMap[canal]    = (canalMap[canal]    || 0) + 1
        })

        const sortDesc = obj => Object.entries(obj)
          .sort((a,b) => b[1]-a[1])
          .map(([name,value]) => ({ name, value }))

        setOrigenes(sortDesc(origenMap).slice(0, 10))
        setMetodos(sortDesc(metodosMap))
        setCanales(sortDesc(canalMap).slice(0, 8))
      }

      // Ventas por marca
      const { data: marcaData } = await supabase.from('mkt_ventas')
        .select('marca').not('marca','is',null)
      if (marcaData) {
        const map = {}
        marcaData.forEach(v => { const m = v.marca || 'Otros'; map[m] = (map[m]||0)+1 })
        setMarcas(Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({ name, value })))
      }

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-500 text-sm">Cargando dashboard...</div>
    </div>
  )

  const sinMatch = (stats?.totalVentas||0) - (stats?.ventasConLead||0)
  const pctMatch = fmtPct(stats?.ventasConLead, stats?.totalVentas)

  return (
    <div className="space-y-6">

      {/* KPIs PRINCIPALES */}
      <div>
        <div className="section-header">
          <h2>Resumen general</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Total ventas" value={fmtNum(stats?.totalVentas)} />
          <KpiCard label="Ventas con lead" value={fmtNum(stats?.ventasConLead)} sub={pctMatch + ' del total'} accent />
          <KpiCard label="Sin lead digital" value={fmtNum(sinMatch)} sub="Otro canal de origen" />
          <KpiCard label="Total leads" value={fmtNum(stats?.totalLeads)} sub={fmtNum(stats?.leadsConTel) + ' con teléfono'} />
        </div>
      </div>

      {/* MÉTODOS DE MATCH + ORÍGENES */}
      <div className="grid grid-cols-2 gap-4">

        {/* Métodos de match */}
        <div className="card">
          <div className="section-header">
            <h2>Cómo se vincularon las ventas</h2>
            <span className="count-badge">{fmtNum(stats?.ventasConLead)} matcheadas</span>
          </div>
          <div className="space-y-2">
            {metodos.map((m, i) => {
              const pct = stats?.ventasConLead > 0 ? Math.round(m.value/stats.ventasConLead*100) : 0
              const colors = { proceso:'#B5E000', dni:'#B5E000', telefono:'#60a5fa', tel_parcial:'#f59e0b', manual:'#a78bfa' }
              const color = colors[m.name] || '#6b7280'
              return (
                <div key={m.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-mono" style={{ color }}>{m.name}</span>
                    <span className="text-gray-400">{fmtNum(m.value)} <span className="text-gray-600">({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background:'#1f1f1f' }}>
                    <div className="h-1.5 rounded-full" style={{ width: pct+'%', background: color }}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Orígenes */}
        <div className="card">
          <div className="section-header">
            <h2>Origen de los leads vinculados</h2>
          </div>
          <div className="space-y-2">
            {origenes.map((o, i) => {
              const max = origenes[0]?.value || 1
              const pct = Math.round(o.value/max*100)
              return (
                <div key={o.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-300 truncate max-w-[180px]" title={o.name}>{o.name}</span>
                    <span className="text-gray-400 ml-2 flex-shrink-0">{fmtNum(o.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background:'#1f1f1f' }}>
                    <div className="h-1.5 rounded-full" style={{ width: pct+'%', background: COLORS[i % COLORS.length] }}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* CANAL Y MARCA */}
      <div className="grid grid-cols-2 gap-4">

        {/* Canal del lead */}
        <div className="card">
          <div className="section-header">
            <h2>Canal de captación</h2>
            <span className="count-badge">Top 8</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={canales} layout="vertical" margin={{ left: 8, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill:'#9ca3af', fontSize:10 }} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill:'#ffffff08' }} />
              <Bar dataKey="value" name="Ventas" radius={[0,4,4,0]}>
                {canales.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Ventas por marca */}
        <div className="card">
          <div className="section-header">
            <h2>Ventas por marca</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={marcas} cx="50%" cy="50%" outerRadius={80}
                dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                labelLine={false} fontSize={10}>
                {marcas.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DETALLE DE ORÍGENES */}
      <div className="card">
        <div className="section-header">
          <h2>Detalle de ventas matcheadas por origen</h2>
          <span className="count-badge">{fmtNum(stats?.ventasConLead)} ventas con lead</span>
        </div>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>Origen del lead</th>
              <th>Ventas vinculadas</th>
              <th>% del total matcheado</th>
              <th>Representación</th>
            </tr></thead>
            <tbody>
              {origenes.map((o, i) => {
                const pct = stats?.ventasConLead > 0 ? (o.value/stats.ventasConLead*100).toFixed(1) : 0
                return (
                  <tr key={o.name}>
                    <td>
                      <span className="font-medium text-white">{o.name}</span>
                    </td>
                    <td className="font-bold" style={{ color: BRAND }}>{fmtNum(o.value)}</td>
                    <td className="text-gray-400">{pct}%</td>
                    <td style={{ width: 180 }}>
                      <div className="h-1.5 rounded-full" style={{ background:'#1f1f1f' }}>
                        <div className="h-1.5 rounded-full" style={{ width: pct+'%', background: COLORS[i%COLORS.length] }}/>
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
