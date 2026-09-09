import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const BRAND = '#B5E000'
const PAGE  = 50

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

export default function Asignados() {
  const [tab,           setTab]           = useState('digital')
  const [data,          setData]          = useState([])
  const [stats,         setStats]         = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [running,       setRunning]       = useState(false)
  const [runLog,        setRunLog]        = useState([])
  const [page,          setPage]          = useState(0)
  const [filters,       setFilters]       = useState({ search: '', tipo: '', campana_codigo: '', mes: '', origen: '', entrega: '' })
  const [meses,         setMeses]         = useState([])
  const [codigosCampana,setCodigosCampana]= useState([])
  const [campanas,      setCampanas]      = useState([])
  const [origenes,      setOrigenes]      = useState([])
  // Edición inline
  const [editing,  setEditing]  = useState(null)  // { id, field, value, leadId }
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    supabase.from('mkt_ventas').select('fecha').not('fecha','is',null)
      .then(({ data }) => {
        if (!data) return
        const u = [...new Set(data.map(r => r.fecha?.slice(0,7)).filter(Boolean))].sort().reverse()
        setMeses(u)
      })
    supabase.from('mkt_leads').select('codigo_campana').not('codigo_campana','is',null)
      .then(({ data }) => {
        if (!data) return
        const u = [...new Set(data.map(r => r.codigo_campana).filter(Boolean))].sort()
        setCodigosCampana(u)
      })
    supabase.from('mkt_campanas').select('id,nombre').order('nombre')
      .then(({ data }) => setCampanas(data || []))
    supabase.from('mkt_leads').select('origen').not('origen','is',null)
      .then(({ data }) => {
        if (!data) return
        const u = [...new Set(data.map(r => r.origen).filter(Boolean))].sort()
        setOrigenes(u)
      })
  }, [])

  const loadStats = useCallback(async () => {
    const applyMes = (q) => filters.mes
      ? q.gte('fecha', filters.mes + '-01').lte('fecha', filters.mes + '-31')
      : q
    const [r1, r2, r3, r4] = await Promise.all([
      applyMes(supabase.from('mkt_ventas').select('*', { count: 'exact', head: true })).not('lead_id','is',null).not('lead_origen','eq','De paso'),
      applyMes(supabase.from('mkt_ventas').select('*', { count: 'exact', head: true })).is('lead_id', null),
      applyMes(supabase.from('mkt_ventas').select('*', { count: 'exact', head: true })),
      supabase.from('mkt_leads').select('*', { count: 'exact', head: true }),
    ])
    setStats({ digital: r1.count||0, otros: r2.count||0, totalV: r3.count||0, totalL: r4.count||0 })
  }, [filters.mes])

  const loadData = useCallback(async () => {
    setLoading(true)
    let leadIdsFiltro = null
    if (filters.campana_codigo) {
      const { data: ml } = await supabase.from('mkt_leads')
        .select('id').eq('codigo_campana', filters.campana_codigo)
      leadIdsFiltro = (ml || []).map(l => l.id)
    }
    let q = supabase.from('mkt_ventas')
      .select(`id,pv_solicitud,fecha,tipo,nombre,dni,telefono_personal,celular_personal,
               vendedor,marca,fuente,metodo_match,lead_id,campana_id,proceso,lead_origen,
               mkt_campanas!mkt_ventas_campana_id_fkey(id,nombre),
               mkt_leads!mkt_ventas_lead_id_fkey(id,nro_tramite,canal,codigo_campana,origen,fecha_consulta)`,
        { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (tab === 'digital') q = q.not('lead_id', 'is', null)
    else q = q.is('lead_id', null)
    if (filters.tipo)    q = q.ilike('tipo', '%' + filters.tipo + '%')
    if (filters.mes)     q = q.gte('fecha', filters.mes + '-01').lte('fecha', filters.mes + '-31')
    if (filters.search)  q = q.or('nombre.ilike.%' + filters.search + '%,dni.eq.' + filters.search + ',pv_solicitud.ilike.%' + filters.search + '%')
    // Filtro por origen: filtra por lead_id donde el lead tiene ese origen
    // Se aplica client-side después de cargar (origen viene del join)
    if (leadIdsFiltro !== null) {
      if (leadIdsFiltro.length > 0) q = q.in('lead_id', leadIdsFiltro)
      else q = q.eq('id', '00000000-0000-0000-0000-000000000000')
    }
    const { data: rows } = await q
    if (!rows || rows.length === 0) { setData([]); setLoading(false); return }

    // Cargar entregas para estas ventas
    const ventaIds = rows.map(r => r.id).filter(Boolean)
    const { data: entregas } = await supabase.from('mkt_entregas')
      .select('id,venta_id,fecha_entrega,salon,sistema')
      .in('venta_id', ventaIds)

    // Mergear entregas en las ventas
    const entregaMap = {}
    if (entregas) entregas.forEach(e => { entregaMap[e.venta_id] = e })
    const rowsConEntrega = rows.map(r => ({ ...r, entrega: entregaMap[r.id] || null }))

    setData(rowsConEntrega)
    setLoading(false)
  }, [tab, page, filters])

  useEffect(() => { loadStats(); loadData() }, [loadStats, loadData])

  // ── CRUCE ──────────────────────────────────────────────────
  async function ejecutarCruce() {
    setRunning(true); setRunLog(['Iniciando cruce...'])
    const log = (m) => setRunLog(prev => [...prev, m])

    log('Cargando leads...')
    let allLeads = []; let from = 0
    while (true) {
      const { data: batch } = await supabase.from('mkt_leads')
        .select('id,dni,telefono,celular,email,campana_id,codigo_campana,nro_tramite,job_seq')
        .range(from, from + 999)
      if (!batch || batch.length === 0) break
      allLeads = allLeads.concat(batch)
      if (batch.length < 1000) break
      from += 1000
    }
    log('Leads cargados: ' + allLeads.length)

    log('Cargando ventas...')
    let allVentas = []; from = 0
    while (true) {
      const { data: batch } = await supabase.from('mkt_ventas')
        .select('id,dni,telefono_personal,celular_personal,proceso,lead_origen')
        .range(from, from + 999)
      if (!batch || batch.length === 0) break
      allVentas = allVentas.concat(batch)
      if (batch.length < 1000) break
      from += 1000
    }
    log('Ventas cargadas: ' + allVentas.length)

    const leadsConDNI = allLeads.filter(l => normDNI(l.dni)).length
    const leadsConTel = allLeads.filter(l => normPhone(l.telefono) || normPhone(l.celular)).length
    log('Leads con DNI: ' + leadsConDNI + ' | con teléfono: ' + leadsConTel + ' | con email: ' + allLeads.filter(l=>l.email).length)
    log('Ventas con DNI: ' + allVentas.filter(v=>normDNI(v.dni)).length + ' | con teléfono: ' + allVentas.filter(v=>normPhone(v.telefono_personal)||normPhone(v.celular_personal)).length)

    log('Construyendo índices...')
    const byDNI = new Map(); const byPhone = new Map(); const byPhone8 = new Map(); const byJobSeq = new Map()
    for (const lead of allLeads) {
      const dni = normDNI(lead.dni)
      const phones = [normPhone(lead.telefono), normPhone(lead.celular)].filter(Boolean)
      if (dni) byDNI.set(dni, lead)
      for (const p of phones) {
        byPhone.set(p, lead)
        if (p.length >= 8) byPhone8.set(p.slice(-8), lead)
      }
      if (lead.job_seq) byJobSeq.set(String(lead.job_seq), lead)
    }
    log('Índices → DNI: ' + byDNI.size + ' | Teléfonos: ' + byPhone.size + ' | Tel-8díg: ' + byPhone8.size + ' | JOB_SEQ: ' + byJobSeq.size)

    log('Ejecutando cruce JOB_SEQ → DNI → Tel exacto → Últimos 8 dígitos...')
    const updates = []
    let matchProceso = 0, matchDNI = 0, matchTel = 0, matchTel8 = 0, sinMatch = 0
    for (const v of allVentas) {
      const vProceso = v.proceso ? String(v.proceso).trim() : null
      const vDNI     = normDNI(v.dni)
      const vPhones  = [normPhone(v.telefono_personal), normPhone(v.celular_personal)].filter(Boolean)
      let lead = null, metodo = null
      if (vProceso && byJobSeq.has(vProceso))        { lead = byJobSeq.get(vProceso); metodo = 'proceso';    matchProceso++ }
      if (!lead && vDNI && byDNI.has(vDNI))          { lead = byDNI.get(vDNI);        metodo = 'dni';        matchDNI++ }
      if (!lead) for (const p of vPhones) if (byPhone.has(p))  { lead = byPhone.get(p);  metodo = 'telefono'; matchTel++;  break }
      if (!lead) for (const p of vPhones) { const p8 = p.slice(-8); if (p8.length===8 && byPhone8.has(p8)) { lead = byPhone8.get(p8); metodo = 'tel_parcial'; matchTel8++; break } }
      if (!lead) sinMatch++
      updates.push({ id: v.id, lead_id: lead?.id||null, campana_id: lead?.campana_id||null, metodo_match: metodo, lead_origen: lead?.origen||null })
    }
    log('Matches → JOB_SEQ: ' + matchProceso + ' | DNI: ' + matchDNI + ' | Tel exacto: ' + matchTel + ' | Tel 8 díg: ' + matchTel8 + ' | Sin match: ' + sinMatch)

    log('Guardando resultados...')
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100)
      await Promise.all(batch.map(u =>
        supabase.from('mkt_ventas').update({ lead_id: u.lead_id, campana_id: u.campana_id, metodo_match: u.metodo_match, lead_origen: u.lead_origen }).eq('id', u.id)
      ))
    }
    log('Cruce completado. ' + updates.length + ' ventas actualizadas.')
    setRunning(false); loadStats(); loadData()
  }

  // ── EDICIÓN INLINE ────────────────────────────────────────
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
  const pct = stats?.totalV > 0 ? Math.round((stats.digital / stats.totalV) * 100) : 0

  return (
    <div className="space-y-5">

      {/* HEADER + KPIs */}
      <div className="card">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-bold text-white text-base">Asignados</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cruce ventas → leads por JOB_SEQ, DNI y teléfono</p>
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
      </div>

      {/* Info box */}
      <div className="info-box success">
        <span className="info-icon">⚡</span>
        <div>
          <strong>¿Cómo funciona el cruce?</strong> El sistema busca en 4 niveles:
          <strong> JOB_SEQ</strong> (vínculo directo del Celer) →
          <strong> DNI</strong> → <strong> Teléfono exacto</strong> → <strong> Últimos 8 dígitos</strong>.
          Las columnas <strong>Canal</strong>, <strong>Campaña</strong> y <strong>Match</strong> son editables — hacé clic en cualquier celda para modificarla.
        </div>
      </div>

      {/* LOG */}
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

      {/* TABLA */}
      <div className="card">
        <div className="flex gap-1 border-b mb-4" style={{ borderColor:'#2a2a2a' }}>
          {[
            { id:'digital', label:'Lead digital / llamada (' + (stats?.digital||0) + ')' },
            { id:'otros',   label:'Sin lead (' + (stats?.otros||0) + ')' },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setPage(0) }}
              className={'px-4 py-2 text-xs font-semibold border-b-2 transition-all -mb-px ' +
                (tab === t.id ? 'text-white border-[#B5E000]' : 'text-gray-500 border-transparent hover:text-gray-300')}>
              {t.label}
            </button>
          ))}
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
            <option value="">Campaña: todas</option>
            {codigosCampana.map(c => (
              <option key={c} value={c}>[{c}]</option>
            ))}
          </select>
          <select className="input-dark" style={{ width: 140 }} value={filters.tipo} onChange={e => sf('tipo', e.target.value)}>
            <option value="">Tipo: todos</option>
            <option>0KM</option>
            <option>USADO</option>
            <option>PLAN AHORRO</option>
          </select>
          <select className="input-dark" style={{ width: 160 }} value={filters.origen} onChange={e => sf('origen', e.target.value)}>
            <option value="">Origen: todos</option>
            {origenes.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <div className="filter-sep"/>
          <select className="input-dark" style={{ width: 150 }} value={filters.entrega} onChange={e => sf('entrega', e.target.value)}>
            <option value="">Entrega: todas</option>
            <option value="con">Con entrega</option>
            <option value="sin">Sin entrega</option>
          </select>
          <div className="filter-sep"/>
          <button onClick={() => { setFilters({ search:'', tipo:'', campana_codigo:'', mes:'', origen:'', entrega:'' }); setPage(0) }}
            className="btn-ghost text-xs flex-shrink-0">Limpiar filtros</button>
        </div>

        <div className="filter-results">
          Mostrando <span>{data.length}</span> registros
          {filters.mes && <> · Mes: <span>{new Date(filters.mes+'-15').toLocaleString('es-AR',{month:'long',year:'numeric'})}</span></>}
          {filters.tipo && <> · Tipo: <span>{filters.tipo}</span></>}
          {filters.origen && <> · Origen: <span>{filters.origen}</span></>}
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>PV/Solicitud</th><th>Fecha</th><th>Tipo</th><th>Cliente</th>
              <th>DNI</th><th>Vendedor</th><th>Marca</th>
              {tab === 'digital' && <><th>Origen</th><th>Canal lead</th><th>Cód. campaña</th><th>Campaña vinculada</th><th>Match</th><th>Fecha entrega</th><th>Salón entrega</th></>}
              {tab === 'otros' && <th>Estado</th>}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && data.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-600">
                  {tab === 'digital' ? 'Sin ventas con lead. Ejecutá el cruce primero.' : 'Todas las ventas tienen lead.'}
                </td></tr>
              )}
              {data.filter(v => {
                if (tab === 'digital' && v.lead_origen === 'De paso') return false
                if (filters.origen) return (v.mkt_leads?.origen || v.lead_origen || '') === filters.origen
                if (filters.entrega === 'con') return !!v.entrega
                if (filters.entrega === 'sin') return !v.entrega
                return true
              }).map(v => {
                const lead = v.mkt_leads
                return (
                  <tr key={v.id}>
                    <td className="font-mono text-xs" style={{ color: BRAND }}>{v.pv_solicitud?.replace('DER-','') || '—'}</td>
                    <td className="text-gray-500 text-xs whitespace-nowrap">
                      {v.fecha ? v.fecha.slice(0,10).split('-').reverse().join('/') : '—'}
                    </td>
                    <td>{v.tipo ? <span className="badge badge-blue">{v.tipo}</span> : '—'}</td>
                    <td className="font-medium text-white">{v.nombre || '—'}</td>
                    <td className="font-mono text-xs text-gray-400">{v.dni || '—'}</td>
                    <td className="text-gray-400">{v.vendedor || '—'}</td>
                    <td>{v.marca ? <span className="badge badge-gray">{v.marca}</span> : '—'}</td>

                    {tab === 'digital' && <>
                      {/* ORIGEN — solo lectura */}
                      <td>
                        {lead?.origen
                          ? <span className="badge badge-gray" style={{ fontSize:'0.65rem' }}>{lead.origen}</span>
                          : <span className="text-gray-600">—</span>}
                      </td>

                      {/* CANAL — editable */}
                      <td onClick={() => !editing && setEditing({ id: v.id, field: 'canal', value: lead?.canal || '', leadId: lead?.id })}>
                        {editing?.id === v.id && editing?.field === 'canal' ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input autoFocus className="input-dark text-xs" style={{ width: 100, padding: '2px 6px', height: 24 }}
                              value={editing.value}
                              onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}
                              onKeyDown={e => { if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditing(null) }} />
                            <button onClick={saveEdit} disabled={saving} style={{ color: BRAND, fontSize: 11 }}>{saving?'...':'✓'}</button>
                            <button onClick={() => setEditing(null)} className="text-gray-600 text-xs">✕</button>
                          </div>
                        ) : (
                          <div className="cursor-pointer group">
                            {lead?.canal ? <span className="badge badge-blue">{lead.canal}</span> : <span className="text-gray-600 text-xs">—</span>}
                            <span className="opacity-0 group-hover:opacity-50 text-xs ml-1">✏</span>
                          </div>
                        )}
                      </td>

                      {/* CAMPAÑA — editable */}
                      <td onClick={() => !editing && setEditing({ id: v.id, field: 'codigo_campana', value: lead?.codigo_campana || '', leadId: lead?.id })}>
                        {editing?.id === v.id && editing?.field === 'codigo_campana' ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input autoFocus className="input-dark text-xs" style={{ width: 80, padding: '2px 6px', height: 24 }}
                              value={editing.value}
                              onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}
                              onKeyDown={e => { if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditing(null) }} />
                            <button onClick={saveEdit} disabled={saving} style={{ color: BRAND, fontSize: 11 }}>{saving?'...':'✓'}</button>
                            <button onClick={() => setEditing(null)} className="text-gray-600 text-xs">✕</button>
                          </div>
                        ) : (
                          <div className="cursor-pointer group">
                            {lead?.codigo_campana ? <span className="badge badge-green">[{lead.codigo_campana}]</span> : <span className="text-gray-600 text-xs">—</span>}
                            <span className="opacity-0 group-hover:opacity-50 text-xs ml-1">✏</span>
                          </div>
                        )}
                      </td>

                      {/* CAMPAÑA VINCULADA (mkt_campanas) — editable con dropdown */}
                      <td onClick={() => !editing && setEditing({ id: v.id, field: 'campana_id', value: v.campana_id || '', leadId: null })}>
                        {editing?.id === v.id && editing?.field === 'campana_id' ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <select autoFocus className="input-dark text-xs" style={{ width: 160, padding: '2px 6px', height: 24 }}
                              value={editing.value}
                              onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}>
                              <option value="">— Sin campaña</option>
                              {campanas.map(c => (
                                <option key={c.id} value={c.id}>{c.nombre}</option>
                              ))}
                            </select>
                            <button onClick={saveEdit} disabled={saving} style={{ color: BRAND, fontSize: 11 }}>{saving?'...':'✓'}</button>
                            <button onClick={() => setEditing(null)} className="text-gray-600 text-xs">✕</button>
                          </div>
                        ) : (
                          <div className="cursor-pointer group">
                            {v.mkt_campanas?.nombre
                              ? <span className="badge badge-green">{v.mkt_campanas.nombre}</span>
                              : <span className="text-gray-600 text-xs">— asignar</span>}
                            <span className="opacity-0 group-hover:opacity-50 text-xs ml-1">✏</span>
                          </div>
                        )}
                      </td>

                      {/* MATCH — editable */}
                      <td onClick={() => !editing && setEditing({ id: v.id, field: 'metodo_match', value: v.metodo_match || '', leadId: null })}>
                        {editing?.id === v.id && editing?.field === 'metodo_match' ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input autoFocus className="input-dark text-xs" style={{ width: 90, padding: '2px 6px', height: 24 }}
                              value={editing.value}
                              onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}
                              onKeyDown={e => { if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditing(null) }} />
                            <button onClick={saveEdit} disabled={saving} style={{ color: BRAND, fontSize: 11 }}>{saving?'...':'✓'}</button>
                            <button onClick={() => setEditing(null)} className="text-gray-600 text-xs">✕</button>
                          </div>
                        ) : (
                          <div className="cursor-pointer group">
                            {v.metodo_match
                              ? <span className={'badge ' + (['dni','proceso'].includes(v.metodo_match)?'badge-green':v.metodo_match==='manual'?'badge-blue':'badge-yellow')}>{v.metodo_match}</span>
                              : <span className="text-gray-600 text-xs">—</span>}
                            <span className="opacity-0 group-hover:opacity-50 text-xs ml-1">✏</span>
                          </div>
                        )}
                      </td>

                      {/* ENTREGA */}
                      <td className="text-xs whitespace-nowrap">
                        {v.entrega?.fecha_entrega
                          ? <span style={{ color: BRAND }}>{String(v.entrega.fecha_entrega).slice(0,10).split('-').reverse().join('/')}</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="text-xs text-gray-400">{v.entrega?.salon || '—'}</td>
                    </>}

                    {tab === 'otros' && <td><span className="badge badge-gray">Sin coincidencia</span></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-600">Página {page+1}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} className="btn-ghost text-xs">← Anterior</button>
            <button onClick={() => setPage(p => p+1)} disabled={data.length < PAGE} className="btn-ghost text-xs">Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
