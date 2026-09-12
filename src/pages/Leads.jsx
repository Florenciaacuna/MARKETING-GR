import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizeFacilitadoresRow, normalizeDerivadoLeadRow } from '../lib/parsers'

const BRAND = '#B5E000'
const PAGE  = 50

function DropZone({ label, sublabel, badge, note, file, onFile, onClear }) {
  const ref = useRef()
  const [drag, setDrag] = useState(false)
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white">{label}</span>
        <span className={'badge ' + badge}>{note}</span>
      </div>
      <div
        className={'dropzone ' + (drag ? 'active' : '') + (file ? ' filled' : '')}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if(f) onFile(f) }}
        onClick={() => ref.current.click()}
      >
        <input ref={ref} type="file" accept=".xls,.xlsx,.csv" className="hidden"
          onChange={e => { if(e.target.files[0]) onFile(e.target.files[0]) }} />
        <div className="text-xl mb-1">{file ? '✓' : '↑'}</div>
        {file ? (
          <div>
            <div className="font-semibold text-sm text-white">Listo para procesar</div>
            <div className="text-xs mt-0.5" style={{ color:'#4b5563' }}>{file.name}</div>
          </div>
        ) : (
          <div>
            <div className="font-semibold text-sm text-white">Clic o arrastrar archivo</div>
            <div className="text-xs text-gray-500 mt-0.5">{sublabel}</div>
          </div>
        )}
      </div>
      {file && (
        <button onClick={onClear} className="text-xs text-gray-600 hover:text-red-400 mt-1 transition-colors">
          ✕ Quitar archivo
        </button>
      )}
    </div>
  )
}

export default function Leads() {
  const [leads,        setLeads]        = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [filters,      setFilters]      = useState({ search: '', canal: '', fuente: '', campana: '' })
  const [fileFac,      setFileFac]      = useState(null)
  const [fileDer,      setFileDer]      = useState(null)
  const [uploading,    setUploading]    = useState(false)
  const [result,       setResult]       = useState(null)
  const [showFmt,      setShowFmt]      = useState(false)
  const [enriching,    setEnriching]    = useState(false)
  const [enrichResult, setEnrichResult] = useState(null)

  const loadLeads = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('mkt_leads')
      .select('id,nro_tramite,fecha_consulta,apellido,nombre,dni,telefono,email,origen,canal,codigo_campana,vendedor,fuente,campana_id,estado', { count: 'exact' })
      .order('fecha_consulta', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (filters.fuente)  q = q.eq('fuente', filters.fuente)
    if (filters.canal)   q = q.ilike('canal', '%' + filters.canal + '%')
    if (filters.campana) q = q.not('campana_id', 'is', null)
    if (filters.search)  q = q.or('apellido.ilike.%' + filters.search + '%,nombre.ilike.%' + filters.search + '%,dni.eq.' + filters.search + ',telefono.eq.' + filters.search)
    const { data, count } = await q
    setLeads(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filters])

  useEffect(() => { loadLeads() }, [loadLeads])

  // ── PROCESAR ARCHIVOS ─────────────────────────────────────
  async function procesar() {
    if (!fileFac && !fileDer) return
    setUploading(true); setResult(null)

    let totalProcesados = 0
    let guardadosFac = 0, guardadosDer = 0
    let errorMsg = null
    let diagFac = null, diagDer = null

    // ── Facilitadores
    if (fileFac) {
      const { data: rows } = await parseFile(fileFac)
      totalProcesados += rows.length
      const cols = Object.keys(rows[0] || {})
      const mapeados = rows.map(normalizeFacilitadoresRow)
      const validos = mapeados
        .map(l => ({ ...l, nro_tramite: l.nro_tramite ? String(l.nro_tramite) : null }))
        .filter(l => l.nro_tramite)
      // Deduplicar
      const visto = new Map()
      validos.forEach(l => visto.set(l.nro_tramite + '|' + l.fuente, l))
      const dedup = Array.from(visto.values())

      diagFac = {
        leidos: rows.length, conNro: dedup.length,
        conDNI: mapeados.filter(l=>l.dni).length,
        conTel: mapeados.filter(l=>l.telefono).length,
        primerID: rows[0] ? String(rows[0]['ID'] || rows[0]['JOB_SEQ'] || '(vacío)') : '—',
        cols: cols.slice(0, 8)
      }

      for (let i = 0; i < dedup.length; i += 500) {
        const batch = dedup.slice(i, i + 500)
        const { error } = await supabase.from('mkt_leads')
          .upsert(batch, { onConflict: 'nro_tramite,fuente', ignoreDuplicates: false })
        if (error) { errorMsg = 'Facilitadores: ' + error.message; break }
        else guardadosFac += batch.length
      }
    }

    // ── Derivado
    if (fileDer) {
      const { data: rows } = await parseFile(fileDer)
      totalProcesados += rows.length
      const mapeados = rows.map(normalizeDerivadoLeadRow)
      const validos = mapeados.filter(l => l.nro_tramite)
      const visto = new Map()
      validos.forEach(l => visto.set(l.nro_tramite + '|' + l.fuente, l))
      const dedup = Array.from(visto.values())

      diagDer = {
        leidos: rows.length, conNro: dedup.length,
        conDNI: mapeados.filter(l=>l.dni).length,
        conTel: mapeados.filter(l=>l.telefono || l.celular).length,
      }

      for (let i = 0; i < dedup.length; i += 500) {
        const batch = dedup.slice(i, i + 500)
        const { error } = await supabase.from('mkt_leads')
          .upsert(batch, { onConflict: 'nro_tramite,fuente', ignoreDuplicates: false })
        if (error) { errorMsg = (errorMsg || '') + ' | Derivado: ' + error.message; break }
        else guardadosDer += batch.length
      }
    }

    setResult({ guardadosFac, guardadosDer, totalProcesados, error: errorMsg, diagFac, diagDer })
    setUploading(false); setFileFac(null); setFileDer(null)
    if (guardadosFac + guardadosDer > 0) loadLeads()
  }

  // ── ENRIQUECIMIENTO CON IA ────────────────────────────────
  async function enriquecerConIA() {
    setEnriching(true); setEnrichResult(null)
    const { data: leadsVacios } = await supabase.from('mkt_leads')
      .select('id,consulta,dni,telefono,email')
      .not('consulta', 'is', null)
      .limit(200)
    if (!leadsVacios?.length) {
      setEnrichResult('No hay leads con texto en CONSULTA.')
      setEnriching(false); return
    }
    const aEnriquecer = leadsVacios.filter(l => !l.dni || !l.telefono || !l.email)
    if (!aEnriquecer.length) {
      setEnrichResult('Todos los leads ya tienen DNI, teléfono y email.')
      setEnriching(false); return
    }
    let actualizados = 0
    for (const lead of aEnriquecer) {
      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6', max_tokens: 200,
            messages: [{ role: 'user', content:
              `Extraé del texto: DNI (7-8 dígitos), teléfono (con +54 si está), email.\nRespondé SOLO JSON sin texto extra: {"dni":"solo dígitos o null","telefono":"número completo o null","email":"email o null"}\n\nTexto: ${String(lead.consulta).slice(0,600)}`
            }]
          })
        })
        const data = await resp.json()
        const raw = data.content?.[0]?.text || '{}'
        const extracted = JSON.parse(raw.replace(/```json|```/g,'').trim())
        const updates = {}
        if (!lead.dni    && extracted.dni    && extracted.dni    !== 'null') updates.dni    = extracted.dni.replace(/\D/g,'')
        if (!lead.telefono && extracted.telefono && extracted.telefono !== 'null') updates.telefono = extracted.telefono
        if (!lead.email  && extracted.email  && extracted.email  !== 'null') updates.email  = extracted.email.toLowerCase()
        if (Object.keys(updates).length > 0) {
          await supabase.from('mkt_leads').update(updates).eq('id', lead.id)
          actualizados++
        }
      } catch(e) { console.error('Error IA:', lead.id, e) }
    }
    setEnrichResult(`Procesados: ${aEnriquecer.length} · Actualizados: ${actualizados}`)
    setEnriching(false); loadLeads()
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  return (
    <div className="space-y-5">

      {/* CARGA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-white text-base">Cargar leads</h2>
            <p className="text-xs text-gray-500 mt-0.5">Dos reportes del Celer — no duplican datos entre sí</p>
          </div>
          <button onClick={() => setShowFmt(p => !p)} className="btn-ghost text-xs">
            {showFmt ? 'Ocultar columnas' : 'Ver columnas'}
          </button>
        </div>

        {showFmt && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg border overflow-hidden" style={{ borderColor:'#2a2a2a' }}>
              <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase" style={{ background:'#0a0a0a' }}>Facilitadores</div>
              <div className="p-2 flex flex-wrap gap-1">
                {['Fecha de consulta','ID','JOB_SEQ','Apellido','Nombre','DNI','TELNUMERO','TELCODAREA','Email','Consulta','USUARIO_DERIVO','campania','websiteName','entryMethod','Empresa'].map(c => (
                  <span key={c} className={'badge ' + (['ID','JOB_SEQ','DNI','TELNUMERO'].includes(c) ? 'badge-green' : 'badge-gray')}
                    style={{ fontFamily:'monospace', fontSize:'0.6rem' }}>{c}</span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor:'#2a2a2a' }}>
              <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase" style={{ background:'#0a0a0a' }}>Derivado</div>
              <div className="p-2 flex flex-wrap gap-1">
                {['Nro Tramite','Fecha de Consulta','Cliente','DNI','Telefono','Celular','Email','Vendedor','Origen','Sub Origen','Campaña','Estado Tramite'].map(c => (
                  <span key={c} className={'badge ' + (['Nro Tramite','DNI','Telefono','Celular'].includes(c) ? 'badge-green' : 'badge-gray')}
                    style={{ fontFamily:'monospace', fontSize:'0.6rem' }}>{c}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <DropZone
            label="Reporte Leads por Facilitadores"
            sublabel="Reporte_Leads_por_Facilitadores.xls"
            badge="badge-green" note="fuente: celer"
            file={fileFac}
            onFile={f => { setFileFac(f); setResult(null) }}
            onClear={() => setFileFac(null)}
          />
          <DropZone
            label="Reporte Derivado"
            sublabel="Reporte_Derviado.xls"
            badge="badge-blue" note="fuente: derivado"
            file={fileDer}
            onFile={f => { setFileDer(f); setResult(null) }}
            onClear={() => setFileDer(null)}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={procesar} disabled={uploading || (!fileFac && !fileDer)} className="btn-primary">
            {uploading ? 'Procesando...' : 'Procesar'}
          </button>
        </div>

        {/* Resultado */}
        {result && (
          <div className="mt-3 p-3 rounded-lg border text-xs space-y-2" style={{ background:'#111', borderColor:'#2a2a2a' }}>
            {result.diagFac && (
              <div>
                <span className="font-bold" style={{ color: BRAND }}>Facilitadores: </span>
                <span className="text-gray-400">{result.guardadosFac} guardados de {result.diagFac.leidos} leídos</span>
                <span className="text-gray-600 ml-2">· Con ID: {result.diagFac.conNro} · DNI: {result.diagFac.conDNI} · Tel: {result.diagFac.conTel}</span>
                {result.diagFac.conNro === 0 && (
                  <div className="text-yellow-400 mt-1">
                    ⚠ Primer valor en ID: <span className="font-mono">{result.diagFac.primerID}</span> ·
                    Columnas: <span className="text-gray-500">{result.diagFac.cols.join(' · ')}</span>
                  </div>
                )}
              </div>
            )}
            {result.diagDer && (
              <div>
                <span className="font-bold" style={{ color: '#60a5fa' }}>Derivado: </span>
                <span className="text-gray-400">{result.guardadosDer} guardados de {result.diagDer.leidos} leídos</span>
                <span className="text-gray-600 ml-2">· Con tramite: {result.diagDer.conNro} · DNI: {result.diagDer.conDNI} · Tel: {result.diagDer.conTel}</span>
              </div>
            )}
            {result.error && <div className="text-red-400">{result.error}</div>}
          </div>
        )}

        {/* Botón IA */}
        <div className="mt-4 pt-4 border-t" style={{ borderColor:'#2a2a2a' }}>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-xs font-bold text-white mb-0.5">Enriquecer leads con IA</div>
              <div className="text-xs text-gray-500">
                Claude lee la columna CONSULTA y extrae DNI, teléfono y email faltantes. Mejora el cruce en Asignados.
              </div>
              {enrichResult && <div className="mt-1 text-xs" style={{ color: BRAND }}>{enrichResult}</div>}
            </div>
            <button onClick={enriquecerConIA} disabled={enriching} className="btn-primary text-xs whitespace-nowrap flex-shrink-0">
              {enriching ? 'Procesando con IA...' : '✦ Enriquecer con IA'}
            </button>
          </div>
        </div>
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="section-header">
          <h2>Leads cargados</h2>
          <span className="count-badge">{total.toLocaleString('es-AR')} registros</span>
        </div>
        <div className="filter-results">
          Mostrando <span>{leads.length}</span> de <span>{total.toLocaleString('es-AR')}</span> leads
          {filters.fuente && <> · Fuente: <span>{filters.fuente === 'celer' ? 'Facilitadores' : 'Derivado'}</span></>}
          {filters.canal && <> · Canal: <span>{filters.canal}</span></>}
        </div>

        <div className="filter-bar">
          <input className="input-dark" style={{ width: 210 }} placeholder="Buscar nombre, DNI, teléfono..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <div className="filter-sep"/>
          <select className="input-dark" style={{ width: 150 }} value={filters.fuente} onChange={e => sf('fuente', e.target.value)}>
            <option value="">Fuente: todas</option>
            <option value="celer">Facilitadores</option>
            <option value="derivado">Derivado</option>
          </select>
          <input className="input-dark" style={{ width: 140 }} placeholder="Canal lead..."
            value={filters.canal} onChange={e => sf('canal', e.target.value)} />
          <div className="filter-sep"/>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={!!filters.campana}
              onChange={e => sf('campana', e.target.checked ? '1' : '')} className="accent-[#B5E000]" />
            Con campaña
          </label>
          <div className="filter-sep"/>
          <button onClick={() => { setFilters({ search:'', canal:'', fuente:'', campana:'' }); setPage(0) }}
            className="btn-ghost text-xs flex-shrink-0">Limpiar filtros</button>
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>Fecha</th><th>Cliente</th><th>DNI</th><th>Teléfono</th>
              <th>Email</th><th>Canal</th><th>Campaña</th><th>Asesor</th><th>Fuente</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-600">
                  Sin leads. Subí los reportes arriba.
                </td></tr>
              )}
              {leads.map(l => (
                <tr key={l.id}>
                  <td className="text-gray-500 text-xs whitespace-nowrap">
                    {l.fecha_consulta ? String(l.fecha_consulta).slice(0,10) : '—'}
                  </td>
                  <td className="font-medium text-white">{l.apellido ? l.apellido + ', ' + l.nombre : l.nombre || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{l.dni || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{l.telefono || '—'}</td>
                  <td className="text-xs text-gray-400 max-w-[130px] truncate">{l.email || '—'}</td>
                  <td>{l.canal ? <span className="badge badge-blue">{l.canal}</span> : <span className="text-gray-600">—</span>}</td>
                  <td>
                    {l.codigo_campana
                      ? <span className={'badge ' + (l.campana_id ? 'badge-green' : 'badge-yellow')}>[{l.codigo_campana}]</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="text-gray-400 text-xs">{l.vendedor || '—'}</td>
                  <td>
                    <span className={'badge ' + (l.fuente === 'celer' ? 'badge-green' : 'badge-blue')}>
                      {l.fuente === 'celer' ? 'Facilitadores' : 'Derivado'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-600">
            {page*PAGE+1}–{Math.min((page+1)*PAGE,total)} de {total.toLocaleString('es-AR')}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} className="btn-ghost text-xs">← Anterior</button>
            <button onClick={() => setPage(p => p+1)} disabled={(page+1)*PAGE>=total} className="btn-ghost text-xs">Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
