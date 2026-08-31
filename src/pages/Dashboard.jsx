import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'

const COLORS = ['#8BC34A', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4']

const fmt = n => n == null ? '—' : new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
}).format(n)

const fmtN = n => (n || 0).toLocaleString('es-AR')

function KPI({ label, value, sub, color = 'bg-white', icon }) {
  return (
    <div className={`${color} rounded-xl shadow-sm border border-gray-100 p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
          <div className="text-3xl font-black text-gray-800 mt-1">{value}</div>
          {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
        </div>
        <div className="text-2xl">{icon}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats,    setStats]    = useState(null)
  const [byCanal,  setByCanal]  = useState([])
  const [byMarca,  setByMarca]  = useState([])
  const [topAsesores, setTopAsesores] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [
        { count: totalLeads  },
        { count: totalVentas },
        { data: campPerf     },
        { data: porCanal     },
        { data: porMarca     },
        { data: asesores     },
      ] = await Promise.all([
        supabase.from('mkt_leads').select('*', { count: 'exact', head: true }),
        supabase.from('mkt_ventas').select('*', { count: 'exact', head: true }),
        supabase.from('mkt_campanas_performance').select('gasto_total,ingreso_total,total_ventas,total_leads'),
        supabase.from('mkt_leads')
          .select('canal')
          .not('canal', 'is', null)
          .limit(1000),
        supabase.from('mkt_ventas')
          .select('marca')
          .not('marca', 'is', null)
          .limit(2000),
        supabase.from('mkt_ventas')
          .select('vendedor')
          .not('vendedor', 'is', null)
          .limit(2000),
      ])

      // Stats globales
      const totalGasto   = (campPerf || []).reduce((s, c) => s + (c.gasto_total   || 0), 0)
      const totalIngreso = (campPerf || []).reduce((s, c) => s + (c.ingreso_total  || 0), 0)
      const ventasAtrib  = (campPerf || []).reduce((s, c) => s + (c.total_ventas   || 0), 0)
      setStats({ totalLeads, totalVentas, totalGasto, totalIngreso, ventasAtrib })

      // Por canal
      const canalCount = {}
      ;(porCanal || []).forEach(r => {
        const c = r.canal || 'Desconocido'
        canalCount[c] = (canalCount[c] || 0) + 1
      })
      setByCanal(
        Object.entries(canalCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([name, value]) => ({ name, value }))
      )

      // Por marca
      const marcaCount = {}
      ;(porMarca || []).forEach(r => {
        const m = r.marca || 'Sin marca'
        marcaCount[m] = (marcaCount[m] || 0) + 1
      })
      setByMarca(
        Object.entries(marcaCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([marca, ventas]) => ({ marca, ventas }))
      )

      // Top asesores
      const asesorCount = {}
      ;(asesores || []).forEach(r => {
        const a = r.vendedor
        asesorCount[a] = (asesorCount[a] || 0) + 1
      })
      setTopAsesores(
        Object.entries(asesorCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([vendedor, ventas]) => ({ vendedor, ventas }))
      )

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="text-center">
        <div className="text-4xl mb-3">⏳</div>
        <div>Cargando dashboard...</div>
      </div>
    </div>
  )

  const tasa = stats?.totalVentas > 0
    ? Math.round((stats.ventasAtrib / stats.totalVentas) * 100)
    : 0

  const roi = stats?.totalGasto > 0 && stats?.totalIngreso > 0
    ? Math.round(((stats.totalIngreso - stats.totalGasto) / stats.totalGasto) * 100)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Visión general del canal digital — Grupo Randazzo</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total leads"     value={fmtN(stats?.totalLeads)}  icon="👥" sub="Acumulado histórico" />
        <KPI label="Ventas totales"  value={fmtN(stats?.totalVentas)} icon="✅" sub="Canal digital + presencial" />
        <KPI label="Gasto campañas"  value={fmt(stats?.totalGasto)}   icon="💸" sub="Inversión registrada" />
        <KPI
          label="ROI global"
          value={roi != null ? `${roi >= 0 ? '+' : ''}${roi}%` : '—'}
          icon="📈"
          sub="Ingreso vs. gasto"
          color={roi != null && roi >= 0 ? 'bg-green-50' : 'bg-white'}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Ingreso atribuido"  value={fmt(stats?.totalIngreso)} icon="💰" />
        <KPI label="Ventas atribuidas"  value={fmtN(stats?.ventasAtrib)} icon="🎯" sub="Con campaña identificada" />
        <KPI label="Tasa atribución"    value={`${tasa}%`}               icon="🔗" sub="De ventas con lead digital" />
        <KPI
          label="CAC promedio"
          value={stats?.ventasAtrib > 0 ? fmt(Math.round((stats.totalGasto || 0) / stats.ventasAtrib)) : '—'}
          icon="🎯"
        />
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Leads por canal */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Leads por canal</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byCanal} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={e => e.name}>
                {byCanal.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Ventas por marca */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Ventas por marca</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byMarca} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="marca" type="category" tick={{ fontSize: 11 }} width={60} />
              <Tooltip />
              <Bar dataKey="ventas" fill="#8BC34A" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top asesores */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 md:col-span-2">
          <h3 className="font-semibold text-gray-700 mb-4">Top asesores por ventas</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topAsesores} margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="vendedor" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="ventas" fill="#2196F3" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ÚLTIMAS CARGAS */}
      <RecentUploads />
    </div>
  )
}

function RecentUploads() {
  const [logs, setLogs] = useState([])
  useEffect(() => {
    supabase.from('mkt_upload_log').select('*').order('fecha_upload', { ascending: false }).limit(3)
      .then(({ data }) => setLogs(data || []))
  }, [])

  if (!logs.length) return null
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-700 mb-3 text-sm">Últimas cargas de datos</h3>
      <div className="space-y-2">
        {logs.map(l => (
          <div key={l.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
            <span className="text-gray-500">{new Date(l.fecha_upload).toLocaleString('es-AR')}</span>
            <span className="text-gray-700">{l.registros_procesados} registros procesados</span>
            <span className="text-green-600 font-medium">+{l.registros_nuevos} nuevos</span>
          </div>
        ))}
      </div>
    </div>
  )
}
