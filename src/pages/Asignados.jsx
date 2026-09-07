import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const BRAND = '#B5E000'
const PAGE  = 50

// Normalizar teléfono para comparación
function normPhone(p) {
  if (!p) return null
  let d = String(p).replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('54') && d.length > 10) d = d.slice(2)
  if (d.startsWith('9')  && d.length > 10) d = d.slice(1)
  if (d.startsWith('0'))                   d = d.slice(1)
  d = d.replace(/^(\d{3,4})15(\d{6,7})$/, '$1$2')
  const l = d.slice(-10)
  return l.length >= 8 ? l : null
}

function normDNI(d) {
  if (!d) return null
  return String(d).replace(/\D/g, '').trim() || null
}

function normEmail(e) {
  if (!e) return null
  return String(e).trim().toLowerCase() || null
}

export default function Asignados() {
  const [tab,     setTab]     = useState('digital')
  const [data,    setData]    = useState([])
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runLog,  setRunLog]  = useState([])
  const [page,    setPage]    = useState(0)
  const [filters, setFilters] = useState({ search: '', marca: '', tipo: '' })

  const loadStats = useCallback(async () => {
    const [{ count: digital }, { count: otros }, { count: totalV }, { count: totalL }] = await Promise.all([
      supabase.from('mkt_ventas').select('*', { count: 'exact', head: true }).not('lead_id', 'is', null),
      supabase.from('mkt_ventas').select('*', { count: 'exact', head: true }).is('lead_id', null),
      supabase.from('mkt_ventas').select('*', { count: 'exact', head: true }),
      supabase.from('mkt_leads').select('*',  { count: 'exact', head: true }),
    ])
    setStats({ digital: digital||0, otros: otros||0, totalV: totalV||0, totalL: totalL||0 })
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('mkt_ventas')
      .select(`id,pv_solicitud,fecha,tipo,nombre,dni,telefono_personal,celular_personal,
               vendedor,marca,fuente,metodo_match,lead_id,
               mkt_leads!mkt_ventas_lead_id_fkey(nro_tramite,canal,codigo_campana,origen,fecha_consulta)`,
        { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (tab === 'digital') q = q.not('lead_id', 'is', null)
    else q = q.is('lead_id', null)
    if (filters.marca)  q = q.ilike('marca',  '%' + filters.marca  + '%')
    if (filters.tipo)   q = q.ilike('tipo',   '%' + filters.tipo   + '%')
    if (filters.search) q = q.or('nombre.ilike.%' + filters.search + '%,dni.eq.' + filters.search + ',pv_solicitud.ilike.%' + filters.search + '%')
    const { data: rows } = await q
    setData(rows || [])
    setLoading(false)
  }, [tab, page, filters])

  useEffect(() => { loadStats(); loadData() }, [loadStats, loadData])

  // ── CRUCE PRINCIPAL ──────────────────────────────────────
  async function ejecutarCruce() {
    setRunning(true)
    setRunLog(['Iniciando cruce...'])
    const log = (msg) => setRunLog(prev => [...prev, msg])

    // 1. Cargar TODOS los leads en páginas de 1000
    log('Cargando leads...')
    let allLeads = []
    let from = 0
    while (true) {
      const { data: batch } = await supabase.from('mkt_leads')
        .select('id,dni,telefono,celular,email,campana_id,codigo_campana')
        .range(from, from + 999)
      if (!batch || batch.length === 0) break
      allLeads = allLeads.concat(batch)
      if (batch.length < 1000) break
      from += 1000
    }
    log(`Leads cargados: ${allLeads.length}`)

    // 2. Cargar TODAS las ventas en páginas de 1000
    log('Cargando ventas...')
    let allVentas = []
    from = 0
    while (true) {
      const { data: batch } = await supabase.from('mkt_ventas')
        .select('id,dni,telefono_personal,celular_personal,email')
        .range(from, from + 999)
      if (!batch || batch.length === 0) break
      allVentas = allVentas.concat(batch)
      if (batch.length < 1000) break
      from += 1000
    }
    log(`Ventas cargadas: ${allVentas.length}`)

    // 3. Diagnóstico de datos disponibles
    const leadsConDNI   = allLeads.filter(l => normDNI(l.dni)).length
    const leadsConTel   = allLeads.filter(l => normPhone(l.telefono) || normPhone(l.celular)).length
    const leadsConEmail = allLeads.filter(l => normEmail(l.email)).length
    log(`Leads con DNI: ${leadsConDNI} | con teléfono: ${leadsConTel} | con email: ${leadsConEmail}`)

    const ventasConDNI   = allVentas.filter(v => normDNI(v.dni)).length
    const ventasConTel   = allVentas.filter(v => normPhone(v.telefono_personal) || normPhone(v.celular_personal)).length
    log(`Ventas con DNI: ${ventasConDNI} | con teléfono: ${ventasConTel}`)

    // 4. Construir índices de búsqueda
    log('Construyendo índices...')
    const byDNI   = new Map()
    const byPhone = new Map()
    const byEmail = new Map()

    for (const lead of allLeads) {
      const dni   = normDNI(lead.dni)
      const tel   = normPhone(lead.telefono)
      const cel   = normPhone(lead.celular)
      const email = normEmail(lead.email)
      if (dni)   byDNI.set(dni, lead)
      if (tel)   byPhone.set(tel, lead)
      if (cel)   byPhone.set(cel, lead)
      if (email) byEmail.set(email, lead)
    }

    // 5. Cruzar
    log('Ejecutando cruce DNI → Teléfono → Email...')
    const updates = []
    let matchDNI = 0, matchTel = 0, matchEmail = 0, sinMatch = 0

    for (const v of allVentas) {
      const vDNI   = normDNI(v.dni)
      const vTel   = normPhone(v.telefono_personal)
      const vCel   = normPhone(v.celular_personal)
      const vEmail = normEmail(v.email)

      let lead = null, metodo = null

      if (vDNI && byDNI.has(vDNI))     { lead = byDNI.get(vDNI);     metodo = 'dni';     matchDNI++ }
      if (!lead && vTel && byPhone.has(vTel)) { lead = byPhone.get(vTel); metodo = 'telefono'; matchTel++ }
      if (!lead && vCel && byPhone.has(vCel)) { lead = byPhone.get(vCel); metodo = 'celular';  matchTel++ }
      if (!lead && vEmail && byEmail.has(vEmail)) { lead = byEmail.get(vEmail); metodo = 'email'; matchEmail++ }
      if (!lead) sinMatch++

      updates.push({
        id:           v.id,
        lead_id:      lead?.id || null,
        campana_id:   lead?.campana_id || null,
        metodo_match: metodo,
      })
    }

    log(`Matches → DNI: ${matchDNI} | Teléfono: ${matchTel} | Email: ${matchEmail} | Sin match: ${sinMatch}`)

    // 6. Guardar en lotes de 100
    log('Guardando resultados...')
    let guardados = 0
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100)
      await Promise.all(batch.map(u =>
        supabase.from('mkt_ventas').update({
          lead_id:      u.lead_id,
          campana_id:   u.campana_id,
          metodo_match: u.metodo_match,
        }).eq('id', u.id)
      ))
      guardados += batch.length
    }

    log(`Cruce completado. ${guardados} ventas actualizadas.`)
    setRunning(false)
    loadStats()
    loadData()
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }
  const pct = stats?.totalV > 0 ? Math.round((stats.digital / stats.totalV) * 100) : 0

  return (
    <div className="space-y-5">

      {/* HEADER + KPIs */}
      <div className="card">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-bold text-white text-base">Asignados</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Cruce ventas → leads por DNI, teléfono y email
            </p>
          </div>
          <button onClick={ejecutarCruce} disabled={running} className="btn-primary">
            {running ? 'Ejecutando...' : 'Ejecutar cruce'}
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="rounded-lg p-4 border" style={{ background:'#111', borderColor:'#2a2a2a' }}>
              <div className="text-2xl font-black text-white">{stats.totalV.toLocaleString('es-AR')}</div>
              <div className="text-xs text-gray-500 mt-1 uppercase font-bold">Total ventas</div>
              <div className="text-xs text-gray-600 mt-0.5">{stats.totalL.toLocaleString('es-AR')} leads en el sistema</div>
            </div>
            <div className="rounded-lg p-4 border" style={{ background:'#1a2e00', borderColor: BRAND }}>
              <div className="text-2xl font-black" style={{ color: BRAND }}>{stats.digital.toLocaleString('es-AR')}</div>
              <div className="text-xs mt-1 uppercase font-bold" style={{ color: BRAND }}>Con lead — {pct}%</div>
              <div className="text-xs text-gray-600 mt-0.5">Origen digital identificado</div>
            </div>
            <div className="rounded-lg p-4 border" style={{ background:'#111', borderColor:'#2a2a2a' }}>
              <div className="text-2xl font-black text-white">{stats.otros.toLocaleString('es-AR')}</div>
              <div className="text-xs text-gray-500 mt-1 uppercase font-bold">Sin lead — {100-pct}%</div>
              <div className="text-xs text-gray-600 mt-0.5">Sin coincidencia digital</div>
            </div>
          </div>
        )}

        {/* Barra progreso */}
        {stats && (
          <div className="mb-4">
            <div className="h-2 rounded-full" style={{ background:'#1f1f1f' }}>
              <div className="h-2 rounded-full transition-all" style={{ background: BRAND, width: pct + '%' }}/>
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-600">
              <span style={{ color: BRAND }}>{pct}% digital</span>
              <span>{100-pct}% otro origen</span>
            </div>
          </div>
        )}

        {/* Info del cruce */}
        <div className="p-3 rounded-lg text-xs text-gray-500" style={{ background:'#111', border:'1px solid #1f1f1f' }}>
          <span className="font-bold" style={{ color: BRAND }}>Método de cruce:</span>{' '}
          1. DNI exacto (más confiable) → 2. Teléfono/celular normalizado → 3. Email.
          Con que haya 1 coincidencia ya se toma como match.
          El cruce procesa <strong className="text-gray-400">todos los registros</strong> sin límite y reescribe los resultados anteriores.
        </div>
      </div>

      {/* LOG DEL CRUCE */}
      {runLog.length > 0 && (
        <div className="rounded-xl p-4 font-mono text-xs text-gray-300 overflow-y-auto max-h-48"
          style={{ background:'#0a0a0a', border:'1px solid #1f1f1f' }}>
          {runLog.map((line, i) => (
            <div key={i} className="leading-relaxed">
              <span className="text-gray-600">[{String(i+1).padStart(2,'0')}]</span> {line}
            </div>
          ))}
          {running && <div className="text-yellow-400 animate-pulse mt-1">Procesando...</div>}
        </div>
      )}

      {/* TABS */}
      <div className="card">
        <div className="flex gap-1 border-b mb-5" style={{ borderColor:'#2a2a2a' }}>
          {[
            { id:'digital', label:'Con lead digital (' + (stats?.digital||0) + ')' },
            { id:'otros',   label:'Sin lead (' + (stats?.otros||0) + ')' },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setPage(0) }}
              className={'px-4 py-2 text-xs font-semibold border-b-2 transition-all -mb-px ' +
                (tab === t.id ? 'text-white border-[#B5E000]' : 'text-gray-500 border-transparent hover:text-gray-300')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input className="input-dark w-48" placeholder="Nombre, DNI, PV..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <input className="input-dark w-32" placeholder="Marca..."
            value={filters.marca} onChange={e => sf('marca', e.target.value)} />
          <input className="input-dark w-32" placeholder="Tipo..."
            value={filters.tipo} onChange={e => sf('tipo', e.target.value)} />
          <button onClick={() => { setFilters({ search:'', marca:'', tipo:'' }); setPage(0) }}
            className="text-xs text-gray-600 hover:text-gray-300">Limpiar</button>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>PV/Solicitud</th>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Cliente</th>
              <th>DNI</th>
              <th>Vendedor</th>
              <th>Marca</th>
              {tab === 'digital' && <>
                <th>Canal lead</th>
                <th>Campaña</th>
                <th>Match por</th>
              </>}
              {tab === 'otros' && <th>Estado</th>}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && data.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-600">
                  {tab === 'digital'
                    ? 'Sin ventas con lead asignado. Ejecutá el cruce primero.'
                    : 'Todas las ventas tienen lead asignado.'}
                </td></tr>
              )}
              {data.map(v => {
                const lead = v.mkt_leads
                return (
                  <tr key={v.id}>
                    <td className="font-mono text-xs" style={{ color: BRAND }}>
                      {v.pv_solicitud?.replace('DER-','') || '—'}
                    </td>
                    <td className="text-gray-500 text-xs whitespace-nowrap">
                      {v.fecha ? v.fecha.slice(0,10).split('-').reverse().join('/') : '—'}
                    </td>
                    <td>{v.tipo ? <span className="badge badge-blue">{v.tipo}</span> : '—'}</td>
                    <td className="font-medium text-white">{v.nombre || '—'}</td>
                    <td className="font-mono text-xs text-gray-400">{v.dni || '—'}</td>
                    <td className="text-gray-400">{v.vendedor || '—'}</td>
                    <td>{v.marca ? <span className="badge badge-gray">{v.marca}</span> : '—'}</td>
                    {tab === 'digital' && <>
                      <td>{lead?.canal ? <span className="badge badge-blue">{lead.canal}</span> : '—'}</td>
                      <td>{lead?.codigo_campana ? <span className="badge badge-green">[{lead.codigo_campana}]</span> : '—'}</td>
                      <td>
                        {v.metodo_match
                          ? <span className={'badge ' + (v.metodo_match==='dni' ? 'badge-green' : v.metodo_match==='email' ? 'badge-blue' : 'badge-yellow')}>
                              {v.metodo_match}
                            </span>
                          : '—'}
                      </td>
                    </>}
                    {tab === 'otros' && (
                      <td><span className="badge badge-gray">Sin coincidencia</span></td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-600">
            Página {page+1}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} className="btn-ghost text-xs">← Anterior</button>
            <button onClick={() => setPage(p => p+1)} disabled={data.length < PAGE} className="btn-ghost text-xs">Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
