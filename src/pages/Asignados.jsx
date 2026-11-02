import PencilIcon from '../components/PencilIcon'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const BRAND = '#B5E000'
const PAGE  = 50

function normPhone(p) {
  if (!p) return null
  let d = String(p).replace(/\D/g, '')
  if (!d) return null
  // Quitar código de país 54
  if (d.startsWith('54') && d.length > 10) d = d.slice(2)
  // Quitar prefijo móvil internacional 9
  if (d.startsWith('9')  && d.length > 10) d = d.slice(1)
  // Quitar troncal 0
  if (d.startsWith('0'))                   d = d.slice(1)
  // Quitar "15" del formato argentino local: CCCC15XXXXXXX (12 dígitos)
  // Soporta códigos de área de 2, 3 o 4 dígitos (ej: 11, 221, 2954)
  if (d.length === 12) {
    if      (d.slice(2, 4) === '15') d = d.slice(0, 2) + d.slice(4) // 11-15-XXXXXXXX
    else if (d.slice(3, 5) === '15') d = d.slice(0, 3) + d.slice(5) // 221-15-XXXXXXX
    else if (d.slice(4, 6) === '15') d = d.slice(0, 4) + d.slice(6) // 2954-15-XXXXXX
  }
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
  const [filters,        setFilters]        = useState({ search: '', tipo: '', campana_codigo: '', campana_id: '', mes: '', origen: '', sub_origen: '', canales: [] })
  const [meses,          setMeses]          = useState([])
  const [codigosCampana, setCodigosCampana] = useState([])
  const [campanas,       setCampanas]       = useState([])
  const [origenes,       setOrigenes]       = useState([])
  const [subOrigenes,    setSubOrigenes]    = useState([])
  const [canalesList,    setCanalesList]    = useState([])
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
    supabase.from('mkt_campanas').select('id,codigo,nombre').order('nombre')
      .then(({ data: d }) => setCampanas(d || []))
    // Origenes y sub-origenes desde mkt_leads
    supabase.from('mkt_leads').select('sub_origen').not('sub_origen','is',null).limit(1000)
      .then(({ data: d }) => { if (d) setSubOrigenes([...new Set(d.map(r => r.sub_origen).filter(Boolean))].sort()) })
    supabase.from('mkt_leads').select('origen').not('origen','is',null).limit(1000)
      .then(({ data: d }) => {
        if (!d) return
        setOrigenes([...new Set(d.map(r => r.origen).filter(Boolean))].sort())
      })
    // Canales: solo de leads vinculados a preventas
    supabase.from('mkt_ventas').select('mkt_leads!mkt_ventas_lead_id_fkey(canal)')
      .not('lead_id','is',null).limit(5000)
      .then(({ data: d }) => {
        const vals = (d||[]).map(v => v.mkt_leads?.canal).filter(Boolean)
        setCanalesList([...new Set(vals)].sort())
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
    if (filters.campana_id && filters.campana_id !== '__con__') {
      const { data: ml } = await supabase.from('mkt_leads').select('id').eq('campana_id', filters.campana_id)
      leadIdsFiltro = (ml || []).map(l => l.id)
    }
    const { data: ents } = await supabase.from('mkt_entregas').select('venta_id').not('venta_id','is',null)
    const entSet = new Set((ents || []).map(e => e.venta_id).filter(Boolean))

    let q = supabase.from('mkt_ventas').select('id,lead_origen').not('lead_id','is',null)
    if (filters.tipo)       q = q.ilike('tipo', '%' + filters.tipo + '%')
    if (filters.mes)        q = q.gte('fecha', filters.mes + '-01').lte('fecha', filters.mes + '-31')
    if (filters.search)     q = q.or('nombre.ilike.%' + filters.search + '%,dni.eq.' + filters.search + ',pv_solicitud.ilike.%' + filters.search + '%,email.ilike.%' + filters.search + '%')
    if (filters.origen)     q = q.eq('lead_origen', filters.origen)
    if (filters.sub_origen) q = q.eq('lead_sub_origen', filters.sub_origen)
    if (filters.campana_id === '__con__') q = q.not('campana_id','is',null)
    else if (filters.campana_id)          q = q.eq('campana_id', filters.campana_id)
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

    // Pre-fetch lead IDs solo cuando se filtra por campaña o canal
    // (origen y sub_origen son columnas directas de mkt_ventas → van al query sin pre-fetch)
    let leadIdsFiltro = null
    if (filters.campana_id && filters.campana_id !== '__con__') {
      let lq = supabase.from('mkt_leads').select('id').eq('campana_id', filters.campana_id)
      if (filters.canales?.length > 0) lq = lq.in('canal', filters.canales)
      const { data: ml } = await lq
      leadIdsFiltro = (ml || []).map(l => l.id)
    } else if (filters.canales?.length > 0) {
      const { data: ml } = await supabase.from('mkt_leads').select('id').in('canal', filters.canales)
      leadIdsFiltro = (ml || []).map(l => l.id)
    }

    let q = supabase.from('mkt_ventas')
      .select('id,pv_solicitud,fecha,tipo,nombre,dni,vendedor,marca,fuente,metodo_match,lead_id,campana_id,proceso,lead_origen,lead_sub_origen,cuil_cuit,email,nombre_conyuge,celular_personal,telefono_personal,mkt_campanas!mkt_ventas_campana_id_fkey(id,nombre),mkt_leads!mkt_ventas_lead_id_fkey(id,nro_tramite,canal,codigo_campana,campana_web,origen,sub_origen,link_anuncio,consulta,fecha_consulta)')
      .order('fecha', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)

    if (tab === 'digital') q = q.not('lead_id','is',null)
    else                   q = q.is('lead_id',null)

    if (filters.tipo)       q = q.ilike('tipo','%' + filters.tipo + '%')
    if (filters.mes)        q = q.gte('fecha', filters.mes + '-01').lte('fecha', filters.mes + '-31')
    if (filters.search)     q = q.or('nombre.ilike.%' + filters.search + '%,dni.eq.' + filters.search + ',pv_solicitud.ilike.%' + filters.search + '%')
    if (filters.campana_id === '__con__') q = q.not('campana_id','is',null)

    // FIX: origen y sub_origen filtran directo en mkt_ventas (columnas lead_origen / lead_sub_origen)
    // No se necesita client-side filter ni pre-fetch de lead IDs para estos
    if (filters.origen)     q = q.eq('lead_origen',     filters.origen)
    if (filters.sub_origen) q = q.eq('lead_sub_origen', filters.sub_origen)

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
      const { data: batch } = await supabase.from('mkt_leads')
        .select('id,dni,telefono,celular,email,campana_id,codigo_campana,nro_tramite,origen,sub_origen')
        .range(from, from+999)
      if (!batch || batch.length === 0) break
      allLeads = allLeads.concat(batch)
      if (batch.length < 1000) break
      from += 1000
    }
    log('Leads cargados: ' + allLeads.length)
    log('Cargando preventas...')
    let allVentas = []; from = 0
    while (true) {
      const { data: batch } = await supabase.from('mkt_ventas')
        .select('id,dni,telefono_personal,celular_personal,email,metodo_match')
        .range(from, from+999)
      if (!batch || batch.length === 0) break
      allVentas = allVentas.concat(batch)
      if (batch.length < 1000) break
      from += 1000
    }
    log('Preventas cargadas: ' + allVentas.length)
    log('Construyendo índices...')
    const byDNI = new Map(); const byPhone = new Map(); const byEmail = new Map()
    for (const lead of allLeads) {
      const dni = normDNI(lead.dni)
      const phones = [normPhone(lead.telefono), normPhone(lead.celular)].filter(Boolean)
      const email = lead.email ? lead.email.trim().toLowerCase() : null
      if (dni)   byDNI.set(dni, lead)
      for (const p of phones) { byPhone.set(p, lead) }
      if (email) byEmail.set(email, lead)
    }
    log('Índices - DNI: ' + byDNI.size + ' | Tel: ' + byPhone.size + ' | Email: ' + byEmail.size)
    log('Ejecutando cruce...')
    const updates = []; let mD = 0, mT = 0, mE = 0, sinM = 0, protegidas = 0
    for (const v of allVentas) {
      // Respetar vínculos hechos a mano — no pisarlos
      if (v.metodo_match === 'manual') { protegidas++; continue }
      const vD      = normDNI(v.dni)
      const vPhones = [normPhone(v.telefono_personal), normPhone(v.celular_personal)].filter(Boolean)
      const vEmail  = v.email ? v.email.trim().toLowerCase() : null
      let lead = null; let metodo = null
      if (!lead && vD     && byDNI.has(vD))    { lead = byDNI.get(vD);    metodo = 'dni';      mD++ }
      if (!lead) { for (const p of vPhones) if (byPhone.has(p)) { lead = byPhone.get(p); metodo = 'telefono'; mT++; break } }
      if (!lead && vEmail && byEmail.has(vEmail)) { lead = byEmail.get(vEmail); metodo = 'email'; mE++ }
      if (!lead) sinM++
      updates.push({
        id:              v.id,
        lead_id:         lead ? lead.id          : null,
        campana_id:      lead ? lead.campana_id  : null,
        metodo_match:    metodo,
        lead_origen:     lead ? lead.origen      : null,
        lead_sub_origen: lead ? lead.sub_origen  : null,
      })
    }
    log('Vínculos manuales respetados: ' + protegidas)
    log('Matches — DNI: ' + mD + ' | Teléfono: ' + mT + ' | Email: ' + mE + ' | Sin match: ' + sinM)
    log('Guardando...')
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i+100)
      await Promise.all(batch.map(u => supabase.from('mkt_ventas').update({
        lead_id:         u.lead_id,
        campana_id:      u.campana_id,
        metodo_match:    u.metodo_match,
        lead_origen:     u.lead_origen,
        lead_sub_origen: u.lead_sub_origen,
      }).eq('id', u.id)))
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
              <div className="text-xs mt-1 uppercase font-bold" style={{ color: BRAND }}>Con lead digital — {pctDigital}%</div>
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
          <select className="input-dark" style={{ width:200 }}
            value={filters.campana_id === '__con__' ? '' : (filters.campana_id||'')}
            onChange={e => sf('campana_id', e.target.value)}>
            <option value="">Campaña: todas</option>
            {campanas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer flex-shrink-0">
            <input type="checkbox"
              checked={filters.campana_id === '__con__'}
              onChange={e => sf('campana_id', e.target.checked ? '__con__' : '')}
              className="accent-[#B5E000]" style={{ width:14, height:14 }} />
            Con campaña
          </label>
          <select className="input-dark" style={{ width: 140 }} value={filters.tipo} onChange={e => sf('tipo', e.target.value)}>
            <option value="">Tipo: todos</option>
            <option>0KM</option>
            <option>USADO</option>
            <option>PLAN AHORRO</option>
          </select>
          <select className="input-dark" style={{ width: 190 }} value={filters.origen} onChange={e => sf('origen', e.target.value)}>
            <option value="">Origen: todos</option>
            <option value="Internet">Internet</option>
            <option value="De paso">De paso</option>
            <option value="Llamadas entrantes">Llamadas entrantes</option>
            <option value="Evento">Evento</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Mercado Libre">Mercado Libre</option>
            {origenes.filter(o => !['Internet','De paso','Llamadas entrantes','Evento','WhatsApp','Mercado Libre'].includes(o)).map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select className="input-dark" style={{ width: 190 }} value={filters.sub_origen} onChange={e => sf('sub_origen', e.target.value)}>
            <option value="">Sub-origen: todos</option>
            {subOrigenes.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <div className="filter-sep"/>
          {/* Canal — multi-select */}
          <div className="relative flex-shrink-0">
            <select className="input-dark" style={{ width:170 }}
              onChange={e => { const v=e.target.value; if(v && !(filters.canales||[]).includes(v)) sf('canales',[...(filters.canales||[]),v]) }}>
              <option value="">Canal...</option>
              {canalesList.filter(c => !(filters.canales||[]).includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {(filters.canales||[]).map(c => (
            <span key={c} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg flex-shrink-0"
              style={{ background:'#1a2e00', color:'#B5E000', border:'1px solid rgba(181,224,0,0.2)' }}>
              {c} <button onClick={() => sf('canales',(filters.canales||[]).filter(x=>x!==c))} style={{ color:'#6b7280' }}>✕</button>
            </span>
          ))}
          <div className="filter-sep"/>
          <button onClick={() => { setFilters({ search:'', tipo:'', campana_codigo:'', campana_id:'', mes:'', origen:'', sub_origen:'', canales:[] }); setPage(0) }}
            className="btn-ghost text-xs flex-shrink-0">Limpiar</button>
        </div>

        <div className="filter-results">
          Mostrando <span>{data.length}</span> registros
          {filters.mes       && <span> — Mes: <span>{new Date(filters.mes+'-15').toLocaleString('es-AR',{month:'long',year:'numeric'})}</span></span>}
          {filters.tipo      && <span> — Tipo: <span>{filters.tipo}</span></span>}
          {filters.origen    && <span> — Origen: <span>{filters.origen}</span></span>}
          {filters.sub_origen && <span> — Sub-origen: <span>{filters.sub_origen}</span></span>}
        </div>

        {tab === 'otros' && (
          <div className="rounded-xl p-4 mb-3 flex items-start gap-3"
            style={{ background:'#1a1500', border:'1px solid #3a2d00' }}>
            <span style={{ fontSize:20 }}>💡</span>
            <div>
              <div className="text-sm font-bold text-white mb-1">¿Cómo vincular estas preventas?</div>
              <div className="text-xs" style={{ color:'#9ca3af' }}>
                Estas preventas no tienen lead asociado. Para vincularlas andá a la hoja de{' '}
                <strong style={{ color:'#B5E000' }}>Preventas</strong>, buscá la preventa y hacé clic en el lápiz ✏ 
                de la columna <strong style={{ color:'#B5E000' }}>Lead vinculado</strong> para asignar el lead correspondiente.
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
          <table className="dark-table" style={{ minWidth: tab === 'digital' ? 1060 : 720 }}>
            <thead>
              <tr>
                <th>PV</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>DNI</th>
                <th>Contacto</th>
                <th>Vendedor</th>
                <th>Marca</th>
                {tab === 'digital' && (
                  <>
                    <th>Origen</th>
                    <th>Sub-origen</th>
                    <th>Canal</th>
                    <th>Campaña</th>
                    <th>Match</th>
                  </>
                )}
                {tab === 'otros' && <th>Estado</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={13} className="text-center py-8 text-gray-600">Cargando...</td></tr>
              )}
              {!loading && data.length === 0 && (
                <tr><td colSpan={13} className="text-center py-10 text-gray-600">
                  {tab === 'digital' ? 'Sin preventas con lead. Ejecutá el cruce primero.' : 'Todas las preventas tienen lead.'}
                </td></tr>
              )}
              {data
                // Solo excluir "De paso" del tab digital cuando no hay filtro de origen activo
                .filter(v => {
                  if (tab === 'digital' && !filters.origen && v.lead_origen === 'De paso') return false
                  return true
                })
                .map(v => {
                  const lead = v.mkt_leads
                  return (
                    <tr key={v.id}>
                      <td className="font-mono text-xs" style={{ color: BRAND, whiteSpace:'nowrap' }}>{v.pv_solicitud || '-'}</td>
                      <td className="text-gray-500 text-xs whitespace-nowrap">{fmtDate(v.fecha)}</td>
                      <td>{v.tipo ? <span className="badge badge-blue" style={{fontSize:'0.6rem'}}>{v.tipo}</span> : '-'}</td>
                      <td className="font-medium text-white text-xs">{v.nombre || '-'}</td>
                      <td className="font-mono text-xs text-gray-400">{v.dni || '-'}</td>
                      <td className="text-xs text-gray-400" style={{ maxWidth:180 }}>
                        <div className="whitespace-nowrap">{v.celular_personal || v.telefono_personal || '-'}</div>
                        {v.email && <div className="truncate" title={v.email}>{v.email}</div>}
                      </td>
                      <td className="text-gray-400 text-xs">{v.vendedor || '-'}</td>
                      <td>{v.marca ? <span className="badge badge-gray" style={{fontSize:'0.6rem'}}>{v.marca}</span> : '-'}</td>

                      {tab === 'digital' && (
                        <>
                          {/* Origen */}
                          <td className="text-xs">
                            {lead?.origen
                              ? <span className="badge badge-gray" style={{fontSize:'0.6rem'}}>{lead.origen}</span>
                              : <span className="text-gray-600">-</span>}
                          </td>

                          {/* Sub-origen — fuente: lead.sub_origen, fallback a lead_sub_origen en venta */}
                          <td className="text-xs whitespace-nowrap">
                            <div className="text-gray-300">
                              {(lead?.sub_origen) || v.lead_sub_origen || <span className="text-gray-600">-</span>}
                            </div>
                            {lead?.link_anuncio && (
                              <a href={lead.link_anuncio} target="_blank" rel="noopener noreferrer"
                                style={{ color: BRAND, textDecoration:'underline' }}>Ver anuncio ↗</a>
                            )}
                          </td>

                          {/* Canal — editable */}
                          <td onClick={() => !editing && setEditing({ id: v.id, field: 'canal', value: lead?.canal || '', leadId: lead ? lead.id : null })}>
                            {editing && editing.id === v.id && editing.field === 'canal' ? (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <input autoFocus className="input-dark text-xs"
                                  style={{ width: 90, padding: '2px 6px', height: 24 }}
                                  value={editing.value}
                                  onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }} />
                                <button onClick={saveEdit} disabled={saving} style={{ color: BRAND, fontSize: 11 }}>{saving ? '...' : 'ok'}</button>
                                <button onClick={() => setEditing(null)} className="text-gray-600 text-xs">x</button>
                              </div>
                            ) : (
                              <div className="cursor-pointer">
                                {lead?.canal
                                  ? <span className="badge badge-blue" style={{fontSize:'0.6rem'}}>{lead.canal}</span>
                                  : <span className="text-gray-600 text-xs">- ed</span>}
                              </div>
                            )}
                          </td>

                          {/* Campaña — editable */}
                          <td>
                            <div className="cursor-pointer"
                              onClick={() => !editing && setEditing({ id: v.id, field: 'campana_id', value: v.campana_id || '', leadId: null })}>
                              {editing && editing.id === v.id && editing.field === 'campana_id' ? (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <select autoFocus className="input-dark text-xs"
                                    style={{ width: 130, padding: '2px 4px', height: 22 }}
                                    value={editing.value}
                                    onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}>
                                    <option value="">Sin campaña</option>
                                    {campanas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                  </select>
                                  <button onClick={saveEdit} disabled={saving} style={{ color: BRAND, fontSize: 10 }}>{saving ? '...' : 'ok'}</button>
                                  <button onClick={() => setEditing(null)} className="text-gray-600 text-xs">x</button>
                                </div>
                              ) : (() => {
                                if (v.mkt_campanas) {
                                  return <span className="text-xs font-medium text-white">{v.mkt_campanas.nombre}</span>
                                }
                                if (lead?.codigo_campana) {
                                  const c = campanas.find(x => x.codigo && x.codigo.toLowerCase() === lead.codigo_campana.toLowerCase())
                                  return <span className="text-xs" style={{ color:'#9ca3af' }}>{c ? c.nombre : `[${lead.codigo_campana}]`}</span>
                                }
                                return <span className="text-xs" style={{ color:'#374151' }}>—</span>
                              })()}
                            </div>
                          </td>

                          {/* Match — editable */}
                          <td onClick={() => !editing && setEditing({ id: v.id, field: 'metodo_match', value: v.metodo_match || '', leadId: null })}>
                            {editing && editing.id === v.id && editing.field === 'metodo_match' ? (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <input autoFocus className="input-dark text-xs"
                                  style={{ width: 90, padding: '2px 6px', height: 24 }}
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
          <span className="text-xs text-gray-600">Página {page + 1}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} className="btn-ghost text-xs">Anterior</button>
            <button onClick={() => setPage(p => p+1)} disabled={data.length < PAGE} className="btn-ghost text-xs">Siguiente</button>
          </div>
        </div>

      </div>
    </div>
  )
}
