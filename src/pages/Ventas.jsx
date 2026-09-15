import PencilIcon from '../components/PencilIcon'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizePVRow } from '../lib/parsers'
import DatePicker from '../components/DatePicker'

const BRAND = '#B5E000'
const PAGE  = 50

export default function Ventas() {
  const [data,      setData]      = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [file,      setFile]      = useState(null)
  const [campanas,  setCampanas]  = useState([])
  const inputRef = useRef()

  const [filters, setFilters] = useState({
    search: '', tipo: '', marca: '', desde: '', hasta: ''
  })

  // Edición inline
  const [editing,  setEditing]  = useState(null) // { id, field, ventaId }
  const [leadSearch, setLeadSearch] = useState('')
  const [leadResults, setLeadResults] = useState([])
  const [saving,   setSaving]   = useState(false)

  function sf(k, v) { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('mkt_ventas')
      .select(`id,pv_solicitud,fecha,tipo,nombre,dni,telefono_personal,
               celular_personal,vendedor,marca,fuente,metodo_match,
               lead_id,campana_id,proceso,
               mkt_leads!mkt_ventas_lead_id_fkey(id,nro_tramite,nombre,dni,canal,codigo_campana),
               mkt_campanas!mkt_ventas_campana_id_fkey(id,nombre,marca)`,
        { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)

    if (filters.search)  q = q.or(`nombre.ilike.%${filters.search}%,dni.eq.${filters.search},pv_solicitud.ilike.%${filters.search}%`)
    if (filters.tipo)    q = q.eq('tipo', filters.tipo)
    if (filters.marca)   q = q.eq('marca', filters.marca)
    if (filters.desde)   q = q.gte('fecha', filters.desde)
    if (filters.hasta)   q = q.lte('fecha', filters.hasta)

    const { data: rows, count } = await q
    setData(rows || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filters])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('mkt_campanas').select('id,nombre,marca,rubro').order('nombre')
      .then(({ data }) => setCampanas(data || []))
  }, [])

  // --- Upload PV Vinculadas ---
  async function procesar() {
    if (!file) return
    setUploading(true); setUploadMsg('Procesando...')
    try {
      const rows = await parseFile(file)
      const normalized = rows.map(normalizePVRow).filter(Boolean)
      if (!normalized.length) { setUploadMsg('Sin filas válidas.'); setUploading(false); return }
      const { error } = await supabase.from('mkt_ventas')
        .upsert(normalized, { onConflict: 'pv_solicitud,fuente', ignoreDuplicates: false })
      if (error) { setUploadMsg('Error: ' + error.message); setUploading(false); return }
      setUploadMsg(`✓ ${normalized.length} preventas cargadas`)
      setFile(null); load()
    } catch(e) {
      setUploadMsg('Error: ' + e.message)
    }
    setUploading(false)
  }

  // --- Buscar leads para vincular ---
  async function buscarLead(q) {
    setLeadSearch(q)
    if (q.length < 2) { setLeadResults([]); return }
    const { data } = await supabase.from('mkt_leads')
      .select('id,nro_tramite,nombre,dni,canal,codigo_campana')
      .or(`nombre.ilike.%${q}%,dni.eq.${q},nro_tramite.eq.${q}`)
      .limit(8)
    setLeadResults(data || [])
  }

  async function vincularLead(ventaId, lead) {
    setSaving(true)
    await supabase.from('mkt_ventas').update({
      lead_id:      lead.id,
      metodo_match: 'manual',
      campana_id:   null // se puede setear aparte
    }).eq('id', ventaId)
    setEditing(null); setLeadSearch(''); setLeadResults([])
    setSaving(false); load()
  }

  async function desvincularLead(ventaId) {
    if (!confirm('¿Desvincular el lead de esta preventa?')) return
    setSaving(true)
    await supabase.from('mkt_ventas').update({
      lead_id: null, metodo_match: null
    }).eq('id', ventaId)
    setSaving(false); load()
  }

  async function vincularCampana(ventaId, campanaId) {
    setSaving(true)
    await supabase.from('mkt_ventas').update({ campana_id: campanaId || null }).eq('id', ventaId)
    setEditing(null); setSaving(false); load()
  }

  const matchBadge = m => {
    if (!m) return null
    const colors = { proceso:'#22c55e', dni:'#3b82f6', telefono:'#a855f7', tel_parcial:'#f59e0b', manual: BRAND }
    const labels  = { proceso:'PROCESO', dni:'DNI', telefono:'TEL', tel_parcial:'TEL~', manual:'MANUAL' }
    return (
      <span className="font-mono text-xs px-1.5 py-0.5 rounded"
        style={{ background: colors[m] + '20', color: colors[m] || '#9ca3af' }}>
        {labels[m] || m}
      </span>
    )
  }

  return (
    <div className="space-y-4">

      {/* Upload */}
      <div className="card">
        <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color:'#4b5563' }}>
          Reporte PV Vinculadas
        </div>
        <div className="info-box mb-3">
          <span className="info-icon">ℹ</span>
          <div className="text-xs">Descargá el Reporte PV Vinculadas del CRM Celer y subilo sin modificarlo.
            El sistema filtra automáticamente las filas <strong>NO USAR</strong> y los registros <strong>/45</strong>.</div>
        </div>
        <div
          className={'dropzone ' + (file ? 'filled' : '')}
          onClick={() => inputRef.current.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); setFile(e.dataTransfer.files[0]) }}>
          <input ref={inputRef} type="file" accept=".xls,.xlsx" className="hidden"
            onChange={e => setFile(e.target.files[0])} />
          <div className="text-xl mb-1">{file ? '✓' : '↑'}</div>
          <div className="font-semibold text-sm text-white">
            {file ? 'Listo para procesar' : 'Clic o arrastrar archivo'}
          </div>
          {file && <div className="text-xs mt-0.5" style={{ color:'#4b5563' }}>{file.name}</div>}
          {!file && <div className="text-xs text-gray-500 mt-0.5">.xls .xlsx del Celer</div>}
        </div>
        {file && (
          <div className="flex gap-2 mt-3">
            <button onClick={procesar} disabled={uploading} className="btn-primary">
              {uploading ? 'Procesando...' : 'Procesar'}
            </button>
            <button onClick={() => setFile(null)} className="btn-ghost text-xs">Quitar</button>
          </div>
        )}
        {uploadMsg && (
          <div className="text-xs mt-2" style={{ color: uploadMsg.startsWith('✓') ? BRAND : '#ef4444' }}>
            {uploadMsg}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="filter-bar">
          <input className="input-dark" style={{ width:200 }} placeholder="Nombre, DNI, PV..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <div className="filter-sep"/>
          <select className="input-dark" style={{ width:140 }} value={filters.tipo} onChange={e => sf('tipo', e.target.value)}>
            <option value="">Tipo: todos</option>
            <option>0KM</option><option>USADO</option><option>PLAN AHORRO</option>
          </select>
          <select className="input-dark" style={{ width:130 }} value={filters.marca} onChange={e => sf('marca', e.target.value)}>
            <option value="">Marca: todas</option>
            <option>KIARA</option><option>CIARA</option><option>PEARA</option><option>MOVILIS</option>
          </select>
          <div className="filter-sep"/>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-500">Desde</span>
            <DatePicker label="dd/mm/aaaa" value={filters.desde} onChange={v => sf('desde', v)} maxDate={filters.hasta || undefined} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-500">Hasta</span>
            <DatePicker label="dd/mm/aaaa" value={filters.hasta} onChange={v => sf('hasta', v)} minDate={filters.desde || undefined} />
          </div>
          <div className="filter-sep"/>
          <button onClick={() => { setFilters({ search:'', tipo:'', marca:'', desde:'', hasta:'' }); setPage(0) }}
            className="btn-ghost text-xs flex-shrink-0">Limpiar</button>
        </div>
        <div className="filter-results mt-2">
          Mostrando <span>{data.length}</span> de <span>{total}</span> preventas
        </div>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding:0 }}>
        <div className="section-header px-4 pt-4">
          <h2>Preventas cargadas</h2>
          <span className="count-badge">{total} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="dark-table">
            <thead>
              <tr>
                <th>PV/SOLICITUD</th>
                <th>FECHA</th>
                <th>TIPO</th>
                <th>CLIENTE</th>
                <th>DNI</th>
                <th>TELÉFONO</th>
                <th>VENDEDOR</th>
                <th>MARCA</th>
                <th>LEAD VINCULADO</th>
                <th>CAMPAÑA</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center text-gray-500 text-xs py-6">Cargando...</td></tr>
              ) : data.map(v => {
                const lead  = v.mkt_leads
                const camp  = v.mkt_campanas
                const isEditLead = editing?.id === v.id && editing?.field === 'lead'
                const isEditCamp = editing?.id === v.id && editing?.field === 'campana'

                return (
                  <tr key={v.id}>
                    <td className="font-mono text-xs" style={{ color: BRAND }}>{v.pv_solicitud}</td>
                    <td className="text-xs text-gray-400">{v.fecha ? v.fecha.slice(0,10).split('-').reverse().join('/') : '-'}</td>
                    <td><span className="badge badge-gray text-xs">{v.tipo}</span></td>
                    <td className="font-medium text-white text-xs">{v.nombre}</td>
                    <td className="font-mono text-xs text-gray-400">{v.dni || '-'}</td>
                    <td className="text-xs text-gray-400">{v.celular_personal || v.telefono_personal || '-'}</td>
                    <td className="text-xs text-gray-400">{v.vendedor || '-'}</td>
                    <td className="text-xs text-gray-400">{v.marca}</td>

                    {/* LEAD VINCULADO — editable */}
                    <td style={{ minWidth:200 }}>
                      {isEditLead ? (
                        <div style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            className="input-dark text-xs w-full"
                            style={{ padding:'3px 8px' }}
                            placeholder="Buscar por nombre, DNI o tramite..."
                            value={leadSearch}
                            onChange={e => buscarLead(e.target.value)}
                          />
                          {leadResults.length > 0 && (
                            <div style={{
                              position:'absolute', top:'100%', left:0, right:0, zIndex:100,
                              background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:8,
                              boxShadow:'0 8px 24px rgba(0,0,0,0.6)', maxHeight:220, overflowY:'auto'
                            }}>
                              {leadResults.map(l => (
                                <div key={l.id}
                                  className="cursor-pointer px-3 py-2 hover:bg-gray-800 text-xs"
                                  onClick={() => vincularLead(v.id, l)}>
                                  <div className="font-medium text-white">{l.nombre || '—'}</div>
                                  <div style={{ color:'#6b7280' }}>
                                    DNI: {l.dni || '-'} · Trámite: {l.nro_tramite || '-'} · {l.canal || '-'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {leadSearch.length >= 2 && leadResults.length === 0 && (
                            <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:100,
                              background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:8,
                              padding:'8px 12px', fontSize:11, color:'#6b7280' }}>
                              Sin resultados para "{leadSearch}"
                            </div>
                          )}
                          <button onClick={() => { setEditing(null); setLeadSearch(''); setLeadResults([]) }}
                            className="text-xs text-gray-600 mt-1">Cancelar</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 cursor-pointer"
                          onClick={() => { setEditing({ id: v.id, field:'lead' }); setLeadSearch(''); setLeadResults([]) }}>
                          {lead ? (
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-white truncate">{lead.nombre || lead.nro_tramite}</div>
                              <div className="flex gap-1 mt-0.5">
                                {matchBadge(v.metodo_match)}
                                {lead.codigo_campana && (
                                  <span className="text-xs" style={{ color:'#4b5563' }}>[{lead.codigo_campana}]</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color:'#4b5563' }}>— sin lead</span>
                          )}
                          <div className="flex gap-1 flex-shrink-0">
                            <PencilIcon size={13} color="#555" />
                            {lead && (
                              <span className="text-xs text-gray-600 hover:text-red-400"
                                onClick={e => { e.stopPropagation(); desvincularLead(v.id) }}>✕</span>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* CAMPAÑA — editable */}
                    <td style={{ minWidth:160 }}>
                      {isEditCamp ? (
                        <div onClick={e => e.stopPropagation()}>
                          <select autoFocus className="input-dark text-xs w-full"
                            style={{ padding:'3px 6px' }}
                            defaultValue={v.campana_id || ''}
                            onChange={e => vincularCampana(v.id, e.target.value)}>
                            <option value="">— Sin campaña</option>
                            {campanas.map(c => (
                              <option key={c.id} value={c.id}>{c.nombre} ({c.marca})</option>
                            ))}
                          </select>
                          <button onClick={() => setEditing(null)}
                            className="text-xs text-gray-600 mt-1">Cancelar</button>
                        </div>
                      ) : (
                        <div className="cursor-pointer"
                          onClick={() => setEditing({ id: v.id, field:'campana' })}>
                          {camp ? (
                            <div>
                              <div className="text-xs font-medium text-white">{camp.nombre}</div>
                              <div className="text-xs" style={{ color:'#4b5563' }}>{camp.marca}</div>
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color:'#4b5563' }}>— asignar</span>
                          )}
                          <PencilIcon size={13} color="#555" />
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {total > PAGE && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor:'#2a2a2a' }}>
            <span className="text-xs text-gray-500">
              Página {page + 1} de {Math.ceil(total / PAGE)}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
                className="btn-ghost text-xs" style={{ opacity: page === 0 ? 0.3 : 1 }}>← Anterior</button>
              <button onClick={() => setPage(p => p+1)} disabled={(page+1)*PAGE >= total}
                className="btn-ghost text-xs" style={{ opacity: (page+1)*PAGE >= total ? 0.3 : 1 }}>Siguiente →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
