import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeDNI, normalizePhone } from '../lib/parsers'

const BRAND = '#B5E000'
const PAGE  = 50

export default function Asignados() {
  const [tab,       setTab]       = useState('digital') // 'digital' | 'otros'
  const [data,      setData]      = useState([])
  const [stats,     setStats]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [running,   setRunning]   = useState(false)
  const [page,      setPage]      = useState(0)
  const [filters,   setFilters]   = useState({ search: '', marca: '', tipo: '' })

  const loadStats = useCallback(async () => {
    const [{ count: digital }, { count: otros }] = await Promise.all([
      supabase.from('mkt_ventas').select('*', { count: 'exact', head: true }).not('lead_id', 'is', null),
      supabase.from('mkt_ventas').select('*', { count: 'exact', head: true }).is('lead_id', null),
    ])
    setStats({ digital: digital || 0, otros: otros || 0, total: (digital || 0) + (otros || 0) })
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('mkt_ventas')
      .select(`
        id, pv_solicitud, fecha, tipo, nombre, dni,
        telefono_personal, celular_personal, vendedor, marca, fuente,
        metodo_match, lead_id,
        mkt_leads!mkt_ventas_lead_id_fkey(
          nro_tramite, canal, codigo_campana, origen, fecha_consulta
        )
      `, { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)

    if (tab === 'digital') q = q.not('lead_id', 'is', null)
    else q = q.is('lead_id', null)

    if (filters.marca)  q = q.eq('marca', filters.marca)
    if (filters.tipo)   q = q.eq('tipo', filters.tipo)
    if (filters.search) q = q.or(`nombre.ilike.%${filters.search}%,dni.eq.${filters.search},pv_solicitud.ilike.%${filters.search}%`)

    const { data: rows, count } = await q
    setData(rows || [])
    // count handled via stats
    setLoading(false)
  }, [tab, page, filters])

  useEffect(() => { loadStats(); loadData() }, [loadStats, loadData])

  // Ejecutar cruce manualmente
  async function ejecutarCruce() {
    setRunning(true)
    // Traer todos los leads con DNI/teléfono
    const { data: leads } = await supabase.from('mkt_leads')
      .select('id, dni, telefono, celular, campana_id, codigo_campana').limit(10000)

    // Traer ventas sin lead
    const { data: ventas } = await supabase.from('mkt_ventas')
      .select('id, dni, telefono_personal, celular_personal').is('lead_id', null).limit(5000)

    if (!leads || !ventas) { setRunning(false); return }

    // Índices
    const byDNI   = new Map(leads.filter(l=>l.dni).map(l=>[normalizeDNI(l.dni), l]))
    const byPhone = new Map()
    leads.forEach(l => {
      if (l.telefono) byPhone.set(normalizePhone(l.telefono), l)
      if (l.celular)  byPhone.set(normalizePhone(l.celular),  l)
    })

    const updates = []
    for (const v of ventas) {
      const vDNI = normalizeDNI(v.dni)
      const vTel = normalizePhone(v.telefono_personal)
      const vCel = normalizePhone(v.celular_personal)

      let lead = null, metodo = null
      if (vDNI && byDNI.has(vDNI))  { lead = byDNI.get(vDNI); metodo = 'dni' }
      if (!lead && vTel && byPhone.has(vTel)) { lead = byPhone.get(vTel); metodo = 'telefono' }
      if (!lead && vCel && byPhone.has(vCel)) { lead = byPhone.get(vCel); metodo = 'celular' }

      if (lead) updates.push({ id: v.id, lead_id: lead.id, campana_id: lead.campana_id, metodo_match: metodo })
    }

    // Actualizar en batches de 100
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100)
      await Promise.all(batch.map(u =>
        supabase.from('mkt_ventas').update({
          lead_id: u.lead_id, campana_id: u.campana_id, metodo_match: u.metodo_match
        }).eq('id', u.id)
      ))
    }

    setRunning(false)
    loadStats(); loadData()
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  const total = tab === 'digital' ? stats?.digital : stats?.otros
  const pct   = stats?.total > 0 ? Math.round((stats.digital / stats.total) * 100) : 0

  return (
    <div className="space-y-5">

      {/* HEADER + STATS */}
      <div className="card">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-bold text-white text-base">Asignados</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Cruce de ventas con leads por DNI y número de teléfono
            </p>
          </div>
          <button onClick={ejecutarCruce} disabled={running} className="btn-primary text-xs">
            {running ? 'Ejecutando cruce...' : 'Ejecutar cruce ahora'}
          </button>
        </div>

        {/* KPIs */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg p-4 border" style={{ background: '#111', borderColor: '#2a2a2a' }}>
              <div className="text-3xl font-black text-white">{stats.total.toLocaleString('es-AR')}</div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide font-bold">Total ventas / preventas</div>
            </div>
            <div className="rounded-lg p-4 border" style={{ background: '#1a2e00', borderColor: BRAND }}>
              <div className="text-3xl font-black" style={{ color: BRAND }}>{stats.digital.toLocaleString('es-AR')}</div>
              <div className="text-xs mt-1 uppercase tracking-wide font-bold" style={{ color: BRAND }}>Origen digital — {pct}%</div>
              <div className="text-xs text-gray-500 mt-0.5">Cruzaron con un lead de internet</div>
            </div>
            <div className="rounded-lg p-4 border" style={{ background: '#111', borderColor: '#2a2a2a' }}>
              <div className="text-3xl font-black text-white">{stats.otros.toLocaleString('es-AR')}</div>
              <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide font-bold">Otro origen — {100-pct}%</div>
              <div className="text-xs text-gray-600 mt-0.5">Sin lead digital identificado</div>
            </div>
          </div>
        )}

        {/* Barra de progreso */}
        {stats && (
          <div className="mt-4">
            <div className="h-2 rounded-full" style={{ background: '#1f1f1f' }}>
              <div className="h-2 rounded-full transition-all" style={{ background: BRAND, width: `${pct}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-600">
              <span style={{ color: BRAND }}>{pct}% digital</span>
              <span>{100-pct}% otro origen</span>
            </div>
          </div>
        )}

        <div className="mt-4 p-3 rounded-lg text-xs text-gray-500" style={{ background: '#111', border: '1px solid #1f1f1f' }}>
          <span className="font-bold" style={{ color: BRAND }}>Método de cruce:</span>{' '}
          1. DNI exacto (más confiable) → 2. Teléfono normalizado → 3. Celular normalizado.
          El botón "Ejecutar cruce" procesa las ventas sin lead asignado y busca coincidencias en los leads cargados.
        </div>
      </div>

      {/* TABS + TABLA */}
      <div className="card">
        <div className="flex items-center gap-1 mb-5 border-b" style={{ borderColor: '#2a2a2a' }}>
          {[
            { id: 'digital', label: `Origen digital (${stats?.digital || 0})` },
            { id: 'otros',   label: `Otro origen (${stats?.otros || 0})` },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setPage(0) }}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all -mb-px
                ${tab === t.id ? 'border-[#B5E000] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input className="input-dark w-48" placeholder="Buscar nombre, DNI, PV..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <select className="input-dark w-32" value={filters.marca} onChange={e => sf('marca', e.target.value)}>
            <option value="">Marca: todas</option>
            <option>KIARA</option><option>CIARA</option><option>PEARA</option><option>MOVILIS</option>
          </select>
          <select className="input-dark w-32" value={filters.tipo} onChange={e => sf('tipo', e.target.value)}>
            <option value="">Tipo: todos</option>
            <option>0KM</option><option>USADO</option><option>PLAN</option>
          </select>
          <button onClick={() => { setFilters({ search:'', marca:'', tipo:'' }); setPage(0) }}
            className="text-xs text-gray-600 hover:text-gray-300">Limpiar</button>
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#2a2a2a' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>PV/Solicitud</th>
                <th>Fecha venta</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>DNI</th>
                <th>Vendedor</th>
                <th>Marca</th>
                {tab === 'digital' && <>
                  <th>Canal lead</th>
                  <th>Campaña</th>
                  <th>Match por</th>
                  <th>Fecha lead</th>
                </>}
                {tab === 'otros' && <th>Estado</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && data.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-600">
                  {tab === 'digital'
                    ? 'No hay ventas con lead digital asignado. Ejecutá el cruce primero.'
                    : 'No hay ventas sin lead. Todos tienen asignación digital.'}
                </td></tr>
              )}
              {data.map(v => {
                const lead = v.mkt_leads
                return (
                  <tr key={v.id}>
                    <td className="font-mono text-xs" style={{ color: BRAND }}>{v.pv_solicitud}</td>
                    <td className="text-gray-500 text-xs">{v.fecha ? new Date(v.fecha).toLocaleDateString('es-AR') : '—'}</td>
                    <td><span className="badge badge-blue">{v.tipo || '—'}</span></td>
                    <td className="font-medium text-white">{v.nombre || '—'}</td>
                    <td className="font-mono text-xs text-gray-400">{v.dni || '—'}</td>
                    <td className="text-gray-400">{v.vendedor || '—'}</td>
                    <td>{v.marca ? <span className="badge badge-gray">{v.marca}</span> : '—'}</td>
                    {tab === 'digital' && <>
                      <td>{lead?.canal ? <span className="badge badge-blue">{lead.canal}</span> : '—'}</td>
                      <td>{lead?.codigo_campana ? <span className="badge badge-green">[{lead.codigo_campana}]</span> : '—'}</td>
                      <td>
                        {v.metodo_match
                          ? <span className={`badge ${v.metodo_match==='dni' ? 'badge-green' : 'badge-yellow'}`}>{v.metodo_match}</span>
                          : '—'}
                      </td>
                      <td className="text-gray-500 text-xs">
                        {lead?.fecha_consulta ? new Date(lead.fecha_consulta).toLocaleDateString('es-AR') : '—'}
                      </td>
                    </>}
                    {tab === 'otros' && (
                      <td><span className="badge badge-gray">Sin lead digital</span></td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-600">
            {page*PAGE+1}–{Math.min((page+1)*PAGE, total||0)} de {(total||0).toLocaleString('es-AR')}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p=>Math.max(0,p-1))} disabled={page===0} className="btn-ghost text-xs">← Anterior</button>
            <button onClick={() => setPage(p=>p+1)} disabled={(page+1)*PAGE>=(total||0)} className="btn-ghost text-xs">Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
