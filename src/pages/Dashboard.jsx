import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const BRAND  = '#B5E000'
const COLORS = [BRAND, '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4']

const fmt  = n => n == null ? '—' : new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }).format(n)
const fmtN = n => (n||0).toLocaleString('es-AR')

function KPI({ label, value, sub, highlight }) {
  return (
    <div className="rounded-xl p-5 border" style={highlight
      ? { background: BRAND, borderColor: BRAND }
      : { background: '#1a1a1a', borderColor: '#2a2a2a' }}>
      <div className={`text-3xl font-black leading-none mb-1 ${highlight ? 'text-black' : 'text-white'}`}>{value}</div>
      <div className={`text-xs font-bold uppercase tracking-wide ${highlight ? 'text-black/70' : 'text-gray-500'}`}>{label}</div>
      {sub && <div className={`text-xs mt-1 ${highlight ? 'text-black/60' : 'text-gray-600'}`}>{sub}</div>}
    </div>
  )
}

const customTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs border" style={{ background: '#1a1a1a', borderColor: '#2a2a2a', color: '#d1d5db' }}>
      <div className="font-bold text-white mb-1">{label}</div>
      {payload.map((p,i) => <div key={i} style={{color:p.color}}>{p.name}: {p.value}</div>)}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats]             = useState(null)
  const [byCanal, setByCanal]         = useState([])
  const [byMarca, setByMarca]         = useState([])
  const [topAsesores, setTopAsesores] = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { count: totalLeads  },
        { count: totalVentas },
        { count: digital     },
        { data: campPerf     },
        { data: porCanal     },
        { data: porMarca     },
        { data: asesores     },
      ] = await Promise.all([
        supabase.from('mkt_leads').select('*', { count:'exact', head:true }),
        supabase.from('mkt_ventas').select('*', { count:'exact', head:true }),
        supabase.from('mkt_ventas').select('*', { count:'exact', head:true }).not('lead_id','is',null),
        supabase.from('mkt_campanas_performance').select('gasto_total,ingreso_total,total_ventas'),
        supabase.from('mkt_leads').select('canal').not('canal','is',null).limit(2000),
        supabase.from('mkt_ventas').select('marca').not('marca','is',null).limit(2000),
        supabase.from('mkt_ventas').select('vendedor').not('vendedor','is',null).limit(2000),
      ])
      const totalGasto   = (campPerf||[]).reduce((s,c)=>s+(c.gasto_total||0),0)
      const totalIngreso = (campPerf||[]).reduce((s,c)=>s+(c.ingreso_total||0),0)
      setStats({ totalLeads, totalVentas, digital: digital||0, totalGasto, totalIngreso })

      const cc = {}; (porCanal||[]).forEach(r=>{ const c=r.canal||'Otro'; cc[c]=(cc[c]||0)+1 })
      setByCanal(Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,value])=>({name,value})))

      const mc = {}; (porMarca||[]).forEach(r=>{ const m=r.marca||'Sin marca'; mc[m]=(mc[m]||0)+1 })
      setByMarca(Object.entries(mc).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([marca,ventas])=>({marca,ventas})))

      const ac = {}; (asesores||[]).forEach(r=>{ if(r.vendedor) ac[r.vendedor]=(ac[r.vendedor]||0)+1 })
      setTopAsesores(Object.entries(ac).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([vendedor,ventas])=>({vendedor,ventas})))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-600 text-sm">Cargando dashboard...</div>
  )

  const pct = stats?.totalVentas > 0 ? Math.round((stats.digital/stats.totalVentas)*100) : 0
  const roi = stats?.totalGasto > 0 && stats?.totalIngreso > 0
    ? Math.round(((stats.totalIngreso-stats.totalGasto)/stats.totalGasto)*100) : null

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Total leads"     value={fmtN(stats?.totalLeads)}  sub="Histórico acumulado" />
        <KPI label="Total ventas"    value={fmtN(stats?.totalVentas)} sub="K1 + Autodealer" />
        <KPI label="Origen digital"  value={`${pct}%`}                sub={`${fmtN(stats?.digital)} ventas`} highlight={pct > 0} />
        <KPI label="ROI global"      value={roi != null ? `${roi>=0?'+':''}${roi}%` : '—'} sub="Ingreso vs. gasto" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Gasto campañas"  value={fmt(stats?.totalGasto)}   sub="Inversión registrada" />
        <KPI label="Ingreso atribuido" value={fmt(stats?.totalIngreso)} />
        <KPI label="CAC promedio"    value={stats?.digital > 0 ? fmt(Math.round((stats.totalGasto||0)/stats.digital)) : '—'} />
        <KPI label="Sin atribución"  value={fmtN((stats?.totalVentas||0)-(stats?.digital||0))} sub={`${100-pct}% del total`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl p-5 border" style={{ background:'#1a1a1a', borderColor:'#2a2a2a' }}>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Leads por canal</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={byCanal} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                {byCanal.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip content={customTooltip}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl p-5 border" style={{ background:'#1a1a1a', borderColor:'#2a2a2a' }}>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Ventas por marca</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byMarca} layout="vertical" margin={{ left:10, right:20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a"/>
              <XAxis type="number" tick={{ fontSize:11, fill:'#4b5563' }}/>
              <YAxis dataKey="marca" type="category" tick={{ fontSize:12, fill:'#9ca3af' }} width={65}/>
              <Tooltip content={customTooltip}/>
              <Bar dataKey="ventas" fill={BRAND} radius={[0,6,6,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl p-5 border" style={{ background:'#1a1a1a', borderColor:'#2a2a2a' }}>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Top asesores por ventas</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={topAsesores} margin={{ left:0, right:20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a"/>
            <XAxis dataKey="vendedor" tick={{ fontSize:10, fill:'#4b5563' }}/>
            <YAxis tick={{ fontSize:11, fill:'#4b5563' }}/>
            <Tooltip content={customTooltip}/>
            <Bar dataKey="ventas" fill="#3b82f6" radius={[6,6,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
