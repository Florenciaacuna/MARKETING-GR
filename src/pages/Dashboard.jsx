import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'

const BRAND  = '#B5E000'
const COLORS = [BRAND, '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4']

const fmt = n => n == null ? '—' : new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
}).format(n)

const fmtN = n => (n || 0).toLocaleString('es-AR')

function KPI({ label, value, sub, highlight }) {
  return (
    <div className={`rounded-xl p-5 shadow-sm border ${
      highlight ? 'border-transparent text-black' : 'bg-white border-gray-100'}`}
      style={highlight ? { background: BRAND } : {}}>
      <div className={`text-3xl font-black leading-none mb-1 ${highlight ? 'text-black' : 'text-gray-900'}`}>
        {value}
      </div>
      <div className={`text-xs font-bold uppercase tracking-wide ${highlight ? 'text-black/70' : 'text-gray-400'}`}>
        {label}
      </div>
      {sub && <div className={`text-xs mt-1 ${highlight ? 'text-black/60' : 'text-gray-400'}`}>{sub}</div>}
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="font-bold text-gray-700 mb-5 text-xs uppercase tracking-widest">{title}</h3>
      {children}
    </div>
  )
}

export default function Dashboard() {
  const [stats,       setStats]       = useState(null)
  const [byCanal,     setByCanal]     = useState([])
  const [byMarca,     setByMarca]     = useState([])
  const [topAsesores, setTopAsesores] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { count: totalLeads  },
        { count: totalVentas },
        { data: campPerf     },
        { data: porCanal     },
        { data: porMarca     },
        { data: asesores     },
      ] = await Promise.all([
        supabase.from('mkt_leads').select('*',  { count: 'exact', head: true }),
        supabase.from('mkt_ventas').select('*', { count: 'exact', head: true }),
        supabase.from('mkt_campanas_performance').select('gasto_total,ingreso_total,total_ventas'),
        supabase.from('mkt_leads').select('canal').not('canal','is',null).limit(2000),
        supabase.from('mkt_ventas').select('marca').not('marca','is',null).limit(2000),
        supabase.from('mkt_ventas').select('vendedor').not('vendedor','is',null).limit(2000),
      ])

      const totalGasto   = (campPerf||[]).reduce((s,c)=>s+(c.gasto_total||0),0)
      const totalIngreso = (campPerf||[]).reduce((s,c)=>s+(c.ingreso_total||0),0)
      const ventasAtrib  = (campPerf||[]).reduce((s,c)=>s+(c.total_ventas||0),0)
      setStats({ totalLeads, totalVentas, totalGasto, totalIngreso, ventasAtrib })

      const canalCount = {}
      ;(porCanal||[]).forEach(r=>{ const c=r.canal||'Otro'; canalCount[c]=(canalCount[c]||0)+1 })
      setByCanal(Object.entries(canalCount).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,value])=>({name,value})))

      const marcaCount = {}
      ;(porMarca||[]).forEach(r=>{ const m=r.marca||'Sin marca'; marcaCount[m]=(marcaCount[m]||0)+1 })
      setByMarca(Object.entries(marcaCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([marca,ventas])=>({marca,ventas})))

      const ac = {}
      ;(asesores||[]).forEach(r=>{ if(r.vendedor) ac[r.vendedor]=(ac[r.vendedor]||0)+1 })
      setTopAsesores(Object.entries(ac).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([vendedor,ventas])=>({vendedor,ventas})))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="text-sm">Cargando dashboard...</div>
    </div>
  )

  const tasa = stats?.totalVentas > 0 ? Math.round((stats.ventasAtrib/stats.totalVentas)*100) : 0
  const roi  = stats?.totalGasto > 0 && stats?.totalIngreso > 0
    ? Math.round(((stats.totalIngreso-stats.totalGasto)/stats.totalGasto)*100) : null

  return (
    <div className="space-y-6 max-w-screen-xl">

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Total leads"    value={fmtN(stats?.totalLeads)}  sub="Histórico acumulado" />
        <KPI label="Ventas totales" value={fmtN(stats?.totalVentas)} sub="Canal digital" />
        <KPI label="Gasto campañas" value={fmt(stats?.totalGasto)}   sub="Inversión registrada" />
        <KPI label="ROI global"     value={roi != null ? `${roi>=0?'+':''}${roi}%` : '—'}
          sub="Ingreso vs. gasto" highlight={roi != null && roi >= 0} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Ingreso atribuido"  value={fmt(stats?.totalIngreso)} />
        <KPI label="Ventas atribuidas"  value={fmtN(stats?.ventasAtrib)} sub="Con campaña" />
        <KPI label="Tasa atribución"    value={`${tasa}%`}               sub="Leads convertidos" />
        <KPI label="CAC promedio"
          value={stats?.ventasAtrib > 0
            ? fmt(Math.round((stats.totalGasto||0)/stats.ventasAtrib)) : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Leads por canal">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byCanal} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                {byCanal.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Ventas por marca">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byMarca} layout="vertical" margin={{ left:10, right:20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis type="number" tick={{ fontSize:11, fill:'#94a3b8' }}/>
              <YAxis dataKey="marca" type="category" tick={{ fontSize:12, fill:'#64748b' }} width={65}/>
              <Tooltip contentStyle={{ borderRadius:8, border:'none', boxShadow:'0 4px 20px rgba(0,0,0,.1)' }}/>
              <Bar dataKey="ventas" fill={BRAND} radius={[0,6,6,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Top asesores por ventas">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={topAsesores} margin={{ left:0, right:20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
            <XAxis dataKey="vendedor" tick={{ fontSize:10, fill:'#94a3b8' }}/>
            <YAxis tick={{ fontSize:11, fill:'#94a3b8' }}/>
            <Tooltip contentStyle={{ borderRadius:8, border:'none', boxShadow:'0 4px 20px rgba(0,0,0,.1)' }}/>
            <Bar dataKey="ventas" fill="#3b82f6" radius={[6,6,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <RecentUploads />
    </div>
  )
}

function RecentUploads() {
  const [logs, setLogs] = useState([])
  useEffect(() => {
    supabase.from('mkt_upload_log').select('*').order('fecha_upload',{ascending:false}).limit(3)
      .then(({data})=>setLogs(data||[]))
  },[])
  if (!logs.length) return null
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="font-bold text-gray-700 mb-4 text-xs uppercase tracking-widest">Últimas cargas</h3>
      <div className="space-y-2">
        {logs.map(l=>(
          <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
            <span className="text-gray-400">{new Date(l.fecha_upload).toLocaleString('es-AR')}</span>
            <span className="text-gray-600">{l.registros_procesados} procesados</span>
            <span className="font-bold" style={{ color: BRAND }}>+{l.registros_nuevos} nuevos</span>
          </div>
        ))}
      </div>
    </div>
  )
}
