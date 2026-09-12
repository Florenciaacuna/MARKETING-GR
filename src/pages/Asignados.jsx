import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const BRAND = '#B5E000'
const PAGE  = 50

// Helpers fuera del componente para evitar problemas de parsing
function normPhone(p) {
  if (!p) return null
  const raw = String(p)
  let d = raw.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('54') && d.length > 10) d = d.slice(2)
  if (d.startsWith('9')  && d.length > 10) d = d.slice(1)
  if (d.startsWith('0'))                   d = d.slice(1)
  const l = d.slice(-10)
  return l.length >= 8 ? l : null
}
function normDNI(d) {
  if (!d) return null
  const s = String(d).replace(/\D/g, '').trim()
  return s || null
}
function fmtDate(d) {
  if (!d) return '-'
  const s = String(d).slice(0, 10)
  const parts = s.split('-')
  if (parts.length !== 3) return s
  return parts[2] + '/' + parts[1] + '/' + parts[0]
}
function safePct(a, b) {
  if (!b) return 0
  return Math.round((a * 100) / b)
}

export default function Asignados() {
  const [tab,            setTab]            = useState('digital')
  const [data,           setData]           = useState([])
  const [stats,          setStats]          = useState(null)
  const [filteredStats,  setFilteredStats]  = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [running,        setRunning]        = useState(false)
  const [runLog,         setRunLog]         = useState([])
  const [page,           setPage]           = useState(0)
  const [filters,        setFilters]        = useState({ search: '', tipo: '', campana_codigo: '', mes: '', origen: '' })
  const [meses,          setMeses]          = useState([])
  const [codigosCampana, setCodigosCampana] = useState([])
  const [campanas,       setCampanas]       = useState([])
  const [origenes,       setOrigenes]       = useState([])
  const [editing,        setEditing]        = useState(null)
  const [saving,         setSaving]         = useState(false)

  useEffect(() => {
    supabase.from('mkt_ventas').select('fecha').not('fecha','is',null)
      .then(({ data: d }) => {
        if (!d) return
        const u = [...new Set(d.map(r => r.fecha && r.fecha.slice(0,7)).filter(Boolean))].sort().reverse()
        setMeses(u)
      })
    supabase.from('mkt_leads').select('codigo_campana').not('codigo_campana','is',null)
      .then(({ data: d }) => {
        if (!d) return
        setCodigosCampana([...new Set(d.map(r => r.codigo_campana).filter(Boolean))].sort())
      })
    supabase.from('mkt_campanas').select('id,nombre').order('nombre')
      .then(({ data: d }) => setCampanas(d || []))
    supabase.from('mkt_leads').select('origen').not('origen','is',null)
      .then(({ data: d }) => {
        if (!d) return
        setOrigenes([...new Set(d.map(r => r.origen).filter(Boolean))].sort())
      })
  }, [])

  const loadStats = useCallback(async () => {
    const applyMes = q => filters.mes
      ? q.gte('fecha', filters.mes + '-01').lte('fecha', filters.mes + '-31')
      : q
    const [r1, r2, r3, r4] = await Promise.all([
      applyMes(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})).not('lead_id','is',null),
      applyMes(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})).is('lead_id',null),
      applyMes(supabase.from('mkt_ventas').select('*',{count:'exact',head:true})),
      supabase.from('mkt_leads').select('*',{count:'exact',head:true}),
    ])
    setStats({ digital: r1.count||0, otros: r2.count||0, totalV: r3.count||0, totalL: r4.count||0 })
  }, [filters.mes])

  const loadFilteredStats = useCallback(async () => {
    if (tab !== 'digital') { setFilteredStats(null); return }
    let leadIdsFiltro = null
    if (filters.campana_codigo) {
      const { data: ml } = await supabase.from('mkt_leads').select('id').eq('codigo_campana', filters.campana_codigo)
      leadIdsFiltro = (ml || []).map(l => l.id)
    }
    const { data: ents } = await supabase.from('mkt_entregas').select('venta_id').not('venta_id','is',null)
    const entSet = new Set((ents || []).map(e => e.venta_id).filter(Boolean))

    let q = supabase.from('mkt_ventas').select('id,lead_origen').not('lead_id','is',null)
    if (filters.tipo)   q = q.ilike('tipo', '%' + filters.tipo + '%')
    if (filters.mes)    q = q.gte('fecha', filters.mes + '-01').lte('fecha', filters.mes + '-31')
    if (filters.search) q = q.or('nombre.ilike.%' + filters.search + '%,dni.eq.' + filters.search + ',pv_solicitud.ilike.%' + filters.search + '%')
    if (leadIdsFiltro) {
      if (leadIdsFiltro.length > 0) q = q.in('lead_id', leadIdsFiltro)
      else { setFilteredStats({ total:0, conEntrega:0, sinEntrega:0 }); return }
    }
    const { data: ventas } = await q
    if (!ventas) return
    const digital    = ventas.filter(v => v.lead_origen !== 'De paso')
    const total      = digital.length
    const conEntrega = digital.filter(v => entSet.has(v.id)).length
    setFilteredStats({ total, conEntrega, sinEntrega: total - conEntrega })
  }, [tab, filters])

  useEffect(() => { loadFilteredStats() }, [loadFilteredStats])

  const loadData = useCallback(async () => {
    setLoading(true)
    let leadIdsFiltro = null
    if (filters.campana_codigo) {
      const { data: ml } = await supabase.from('mkt_leads').select('id').eq('codigo_campana', filters.campana_codigo)
      leadIdsFiltro = (ml || []).map(l => l.id)
    }
    let q = supabase.from('mkt_ventas')
      .select('id,pv_solicitud,fecha,tipo,nombre,dni,vendedor,marca,fuente,metodo_match,lead_id,campana_id,proceso,lead_origen,mkt_campanas!mkt_ventas_campana_id_fkey(id,nombre),mkt_leads!mkt_ventas_lead_id_fkey(id,nro_tramite,canal,codigo_campana,origen,fecha_consulta)')
      .order('fecha', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (tab === 'digital') q = q.not('lead_id','is',null)
    else q = q.is('lead_id',null)
    if (filters.tipo)   q = q.ilike('tipo','%' + filters.tipo + '%')
    if (filters.mes)    q = q.gte('fecha', filters.mes + '-01').lte('fecha', filters.mes + '-31')
    if (filters.search) q = q.or('nombre.ilike.%' + filters.search + '%,dni.eq.' + filters.search + ',pv_solicitud.ilike.%' + filters.search + '%')
    if (leadIdsFiltro !== null) {
      if (leadIdsFiltro.length > 0) q = q.in('lead_id', leadIdsFiltro)
      else q = q.eq('id','00000000-0000-0000-0000-000000000000')
    }
    const { data: rows } = await q
    setData(rows || [])
    setLoading(false)
  }, [tab, page, filters])

  useEffect(() => { loadStats(); loadData() }, [loadStats, loadData])

  async function ejecutarCruce() {
    setRunning(true); setRunLog(['Iniciando cruce...'])
    const log = m => setRunLog(prev => [...prev, m])
    log('Cargando leads...')
    let allLeads = []; let from = 0
    while (true) {
      const { data: batch } = await supabase.from('mkt_leads').select('id,dni,telefono,celular,campana_id,codigo_campana,nro_tramite,job_seq,origen').range(from, from+999)
      if (!batch || batch.length === 0) break
      allLeads = allLeads.concat(batch)
      if (batch.length < 1000) break
      from += 1000
    }
    log('Leads cargados: ' + allLeads.length)
    log('Cargando preventas...')
    let allVentas = []; from = 0
    while (true) {
      const { data: batch } = await supabase.from('mkt_ventas').select('id,dni,telefono_personal,celular_personal,proceso').range(from, from+999)
      if (!batch || batch.length === 0) break
      allVentas = allVentas.concat(batch)
      if (batch.length < 1000) break
      from += 1000
    }
    log('Prepreventas cargadas: ' + allVentas.length)
    log('Construyendo indices...')
    const byDNI = new Map(); const byPhone = new Map(); const byPhone8 = new Map(); const byJobSeq = new Map()
    for (const lead of allLeads) {
      const dni = normDNI(lead.dni)
      const phones = [normPhone(lead.telefono), normPhone(lead.celular)].filter(Boolean)
      if (dni) byDNI.set(dni, lead)
      for (const p of phones) { byPhone.set(p, lead); if (p.length >= 8) byPhone8.set(p.slice(-8), lead) }
      if (lead.job_seq) byJobSeq.set(String(lead.job_seq), lead)
    }
    log('Indices - DNI: ' + byDNI.size + ' | Tel: ' + byPhone.size + ' | Tel8: ' + byPhone8.size + ' | JOB_SEQ: ' + byJobSeq.size)
    log('Ejecutando cruce...')
    const updates = []; let mP = 0, mD = 0, mT = 0, mT8 = 0, sinM = 0
    for (const v of allVentas) {
      const vP = v.proceso ? String(v.proceso).trim() : null
      const vD = normDNI(v.dni)
      const vPhones = [normPhone(v.telefono_personal), normPhone(v.celular_personal)].filter(Boolean)
      let lead = null; let metodo = null
      if (vP && byJobSeq.has(vP))        { lead = byJobSeq.get(vP); metodo = 'proceso';    mP++ }
      if (!lead && vD && byDNI.has(vD))  { lead = byDNI.get(vD);    metodo = 'dni';        mD++ }
      if (!lead) { for (const p of vPhones) if (byPhone.has(p))  { lead = byPhone.get(p);  metodo = 'telefono';  mT++;  break } }
      if (!lead) { for (const p of vPhones) { const p8 = p.slice(-8); if (p8.length === 8 && byPhone8.has(p8)) { lead = byPhone8.get(p8); metodo = 'tel_parcial'; mT8++; break } } }
      if (!lead) sinM++
      updates.push({ id: v.id, lead_id: lead ? lead.id : null, campana_id: lead ? lead.campana_id : null, metodo_match: metodo, lead_origen: lead ? lead.origen : null })
    }
    log('Matches - JOB_SEQ: ' + mP + ' | DNI: ' + mD + ' | Tel: ' + mT + ' | Tel8: ' + mT8 + ' | Sin match: ' + sinM)
    log('Guardando...')
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i+100)
      await Promise.all(batch.map(u => supabase.from('mkt_ventas').update({ lead_id: u.lead_id, campana_id: u.campana_id, metodo_match: u.metodo_match, lead_origen: u.lead_origen }).eq('id', u.id)))
    }
    log('Cruce completado. ' + updates.length + ' preventas actualizadas.')
    setRunning(false); loadStats(); loadData()
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    const { id, field, value, leadId } = editing
    if (field === 'metodo_match') {
      await supabase.from('mkt_ventas').update({ metodo_match: value || null }).eq('id', id)
    } else if (field === 'campana_id') {
      await supabase.from('mkt_ventas').update({ campana_id: value || null }).eq('id', id)
    } else if ((field === 'canal' || field === 'codigo_campana') && leadId) {
      await supabase.from('mkt_leads').update({ [field]: value || null }).eq('id', leadId)
    }
    setEditing(null); setSaving(false); loadData()
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }
  const pctDigital = safePct(stats ? stats.digital : 0, stats ? stats.totalV : 0)
  const pctFiltEnt = filteredStats ? safePct(filteredStats.conEntrega, filteredStats.total) : 0

  return (
    <div className="space-y-5">

      <div className="card">
        <div className="flex items-start justify-between mb-4">
          
          <button onClick={ejecutarCruce} disabled={running} className="btn-primary">
            {running ? 'Ejecutando...' : 'Ejecutar cruce'}
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="rounded-lg p-4 border" style={{ background:'#111', borderColor:'#2a2a2a' }}>
              <div className="text-2xl font-black text-white">{stats.totalV.toLocaleString('es-AR')}</div>
              <div className="text-xs text-gray-500 mt-1 uppercase font-bold">Total preventas</div>
            </div>
            <div className="rounded-lg p-4 border" style={{ background:'#1a2e00', borderColor: BRAND }}>
              <div className="text-2xl font-black" style={{ color: BRAND }}>{stats.digital.toLocaleString('es-AR')}</div>
              <div className="text-xs mt-1 uppercase font-bold" style={{ color: BRAND }}>Con lead digital - {pctDigital}%</div>
            </div>
            <div className="rounded-lg p-4 border" style={{ background:'#111', borderColor:'#2a2a2a' }}>
              <div className="text-2xl font-black text-white">{stats.otros.toLocaleString('es-AR')}</div>
              <div className="text-xs text-gray-500 mt-1 uppercase font-bold">Sin lead</div>
            </div>
          </div>
        )}

        {stats && (
          <div className="mb-2">
            <div className="h-2 rounded-full" style={{ background:'#1f1f1f' }}>
              <div className="h-2 rounded-full transition-all" style={{ background: BRAND, width: pctDigital + '%' }}/>
            </div>
          </div>
        )}
      </div>



      {runLog.length > 0 && (
        <div className="rounded-xl p-4 font-mono text-xs text-gray-300 overflow-y-auto max-h-48" style={{ background:'#0a0a0a', border:'1px solid #1f1f1f' }}>
          {runLog.map((line, i) => (
            <div key={i} className="leading-relaxed">
              <span className="text-gray-600">[{String(i+1).padStart(2,'0')}]</span> {line}
            </div>
          ))}
          {running && <div className="text-yellow-400 animate-pulse mt-1">Procesando...</div>}
        </div>
      )}

      <div className="card">
        <div className="flex gap-1 border-b mb-4" style={{ borderColor:'#2a2a2a' }}>
          <button onClick={() => { setTab('digital'); setPage(0) }}
            className={'px-4 py-2 text-xs font-semibold border-b-2 transition-all -mb-px ' + (tab === 'digital' ? 'text-white border-[#B5E000]' : 'text-gray-500 border-transparent hover:text-gray-300')}>
            Lead asignado ({stats ? stats.digital : 0})
          </button>
          <button onClick={() => { setTab('otros'); setPage(0) }}
            className={'px-4 py-2 text-xs font-semibold border-b-2 transition-all -mb-px ' + (tab === 'otros' ? 'text-white border-[#B5E000]' : 'text-gray-500 border-transparent hover:text-gray-300')}>
            Sin lead ({stats ? stats.otros : 0})
          </button>
        </div>

        <div className="filter-bar">
          <select className="input-dark" style={{ width: 160 }} value={filters.mes} onChange={e => sf('mes', e.target.value)}>
            <option value="">Mes: todos</option>
            {meses.map(m => (
              <option key={m} value={m}>
                {new Date(m + '-15').toLocaleString('es-AR', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
          <div className="filter-sep"/>
          <input className="input-dark" style={{ width: 200 }} placeholder="Buscar cliente, DNI, PV..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <div className="filter-sep"/>
          <select className="input-dark" style={{ width: 160 }} value={filters.campana_codigo} onChange={e => sf('campana_codigo', e.target.value)}>
            <option value="">Campana: todas</option>
            {codigosCampana.map(c => <option key={c} value={c}>[{c}]</option>)}
          </select>
          <select className="input-dark" style={{ width: 140 }} value={filters.tipo} onChange={e => sf('tipo', e.target.value)}>
            <option value="">Tipo: todos</option>
            <option>0KM</option>
            <option>USADO</option>
            <option>PLAN AHORRO</option>
          </select>
          <select className="input-dark" style={{ width: 170 }} value={filters.origen} onChange={e => sf('origen', e.target.value)}>
            <option value="">Origen: todos</option>
            {origenes.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <div className="filter-sep"/>
          <button onClick={() => { setFilters({ search:'', tipo:'', campana_codigo:'', mes:'', origen:'' }); setPage(0) }}
            className="btn-ghost text-xs flex-shrink-0">Limpiar</button>
        </div>

        <div className="filter-results">
          Mostrando <span>{data.length}</span> registros
          {filters.mes && <span> - Mes: <span>{new Date(filters.mes+'-15').toLocaleString('es-AR',{month:'long',year:'numeric'})}</span></span>}
          {filters.tipo && <span> - Tipo: <span>{filters.tipo}</span></span>}
          {filters.origen && <span> - Origen: <span>{filters.origen}</span></span>}
        </div>



        <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>PV</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>DNI</th>
                <th>Vendedor</th>
                <th>Marca</th>
                {tab === 'digital' && (
                  <>
                    <th>Origen</th>
                    <th>Canal</th>
                    <th>Campana</th>
                    <th>Match</th>
                  </>
                )}
                {tab === 'otros' && <th>Estado</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="text-center py-8 text-gray-600">Cargando...</td></tr>
              )}
              {!loading && data.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-600">
                  {tab === 'digital' ? 'Sin preventas con lead. Ejecuta el cruce primero.' : 'Todas las preventas tienen lead.'}
                </td></tr>
              )}
              {data.filter(v => {
                if (tab === 'digital' && v.lead_origen === 'De paso') return false
                if (filters.origen) {
                  const o = v.mkt_leads ? v.mkt_leads.origen : v.lead_origen
                  return o === filters.origen
                }
                return true
              }).map(v => {
                const lead = v.mkt_leads
                return (
                  <tr key={v.id}>
                    <td className="font-mono text-xs" style={{ color: BRAND, whiteSpace:'nowrap' }}>{v.pv_solicitud || '-'}</td>
                    <td className="text-gray-500 text-xs whitespace-nowrap">{fmtDate(v.fecha)}</td>
                    <td>{v.tipo ? <span className="badge badge-blue" style={{fontSize:'0.6rem'}}>{v.tipo}</span> : '-'}</td>
                    <td className="font-medium text-white text-xs">{v.nombre || '-'}</td>
                    <td className="font-mono text-xs text-gray-400">{v.dni || '-'}</td>
                    <td className="text-gray-400 text-xs">{v.vendedor || '-'}</td>
                    <td>{v.marca ? <span className="badge badge-gray" style={{fontSize:'0.6rem'}}>{v.marca}</span> : '-'}</td>

                    {tab === 'digital' && (
                      <>
                        <td className="text-xs">
                          {lead && lead.origen ? <span className="badge badge-gray" style={{fontSize:'0.6rem'}}>{lead.origen}</span> : <span className="text-gray-600">-</span>}
                        </td>

                        <td onClick={() => !editing && setEditing({ id: v.id, field: 'canal', value: (lead && lead.canal) ? lead.canal : '', leadId: lead ? lead.id : null })}>
                          {editing && editing.id === v.id && editing.field === 'canal' ? (
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <input autoFocus className="input-dark text-xs" style={{ width: 90, padding: '2px 6px', height: 24 }}
                                value={editing.value}
                                onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }} />
                              <button onClick={saveEdit} disabled={saving} style={{ color: BRAND, fontSize: 11 }}>{saving ? '...' : 'ok'}</button>
                              <button onClick={() => setEditing(null)} className="text-gray-600 text-xs">x</button>
                            </div>
                          ) : (
                            <div className="cursor-pointer group">
                              {lead && lead.canal ? <span className="badge badge-blue" style={{fontSize:'0.6rem'}}>{lead.canal}</span> : <span className="text-gray-600 text-xs">- ed</span>}
                            </div>
                          )}
                        </td>

                        <td>
                          <div className="flex flex-col gap-0.5">
                            {lead && lead.codigo_campana && <span className="badge badge-green" style={{fontSize:'0.6rem'}}>[{lead.codigo_campana}]</span>}
                            <div className="cursor-pointer" onClick={() => !editing && setEditing({ id: v.id, field: 'campana_id', value: v.campana_id || '', leadId: null })}>
                              {editing && editing.id === v.id && editing.field === 'campana_id' ? (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <select autoFocus className="input-dark text-xs" style={{ width: 130, padding: '2px 4px', height: 22 }}
                                    value={editing.value} onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}>
                                    <option value="">Sin campana</option>
                                    {campanas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                  </select>
                                  <button onClick={saveEdit} disabled={saving} style={{ color: BRAND, fontSize: 10 }}>{saving ? '...' : 'ok'}</button>
                                  <button onClick={() => setEditing(null)} className="text-gray-600 text-xs">x</button>
                                </div>
                              ) : (
                                <span className="text-gray-500 text-xs">{v.mkt_campanas ? v.mkt_campanas.nombre : '- asignar'}</span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td onClick={() => !editing && setEditing({ id: v.id, field: 'metodo_match', value: v.metodo_match || '', leadId: null })}>
                          {editing && editing.id === v.id && editing.field === 'metodo_match' ? (
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <input autoFocus className="input-dark text-xs" style={{ width: 90, padding: '2px 6px', height: 24 }}
                                value={editing.value}
                                onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }} />
                              <button onClick={saveEdit} disabled={saving} style={{ color: BRAND, fontSize: 11 }}>{saving ? '...' : 'ok'}</button>
                              <button onClick={() => setEditing(null)} className="text-gray-600 text-xs">x</button>
                            </div>
                          ) : (
                            <div className="cursor-pointer">
                              {v.metodo_match ? (
                                <span className={'badge ' + (['dni','proceso'].includes(v.metodo_match) ? 'badge-green' : v.metodo_match === 'manual' ? 'badge-blue' : 'badge-yellow')}>
                                  {v.metodo_match}
                                </span>
                              ) : <span className="text-gray-600 text-xs">-</span>}
                            </div>
                          )}
                        </td>
                      </>
                    )}

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
          <span className="text-xs text-gray-600">Pagina {page + 1}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} className="btn-ghost text-xs">Anterior</button>
            <button onClick={() => setPage(p => p+1)} disabled={data.length < PAGE} className="btn-ghost text-xs">Siguiente</button>
          </div>
        </div>

      </div>
    </div>
  )
}
