import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizeFacilitadoresRow } from '../lib/parsers'

const BRAND = '#B5E000'
const PAGE  = 50

export default function Leads() {
  const [leads,     setLeads]     = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [filters,   setFilters]   = useState({ search: '', canal: '', fuente: '', campana: '' })
  const [file,      setFile]      = useState(null)
  const [dragging,  setDragging]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result,    setResult]    = useState(null)
  const [showFmt,   setShowFmt]   = useState(false)
  const fileRef = useRef()


  // ── AGENTE IA — Enriquecer desde CONSULTA ────────────────
  const [enriching,   setEnriching]   = useState(false)
  const [enrichResult,setEnrichResult]= useState(null)

  async function enriquecerConIA() {
    setEnriching(true)
    setEnrichResult(null)

    // Traer leads con CONSULTA pero sin DNI o teléfono
    const { data: leadsVacios } = await supabase
      .from('mkt_leads')
      .select('id, consulta, dni, telefono, email')
      .not('consulta', 'is', null)
      .limit(200)  // procesar de a 200 por vez

    if (!leadsVacios || leadsVacios.length === 0) {
      setEnrichResult('No hay leads con CONSULTA para procesar.')
      setEnriching(false)
      return
    }

    // Filtrar los que les falta algún dato clave
    const aEnriquecer = leadsVacios.filter(l =>
      !l.dni || !l.telefono || !l.email
    )

    if (aEnriquecer.length === 0) {
      setEnrichResult('Todos los leads ya tienen DNI, teléfono y email completos.')
      setEnriching(false)
      return
    }

    // Llamar a Claude para extraer datos de cada CONSULTA
    let actualizados = 0
    for (const lead of aEnriquecer) {
      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: `Extraé del siguiente texto estos datos si están presentes. Respondé SOLO con JSON válido, sin texto adicional:
{"dni": "solo dígitos o null", "telefono": "con código de país si tiene, o null", "email": "email o null"}

Texto:
${lead.consulta.slice(0, 800)}`
            }]
          })
        })

        const data = await resp.json()
        const raw  = data.content?.[0]?.text || '{}'
        const clean = raw.replace(/```json|```/g, '').trim()
        const extracted = JSON.parse(clean)

        const updates = {}
        if (!lead.dni    && extracted.dni    && extracted.dni !== 'null')    updates.dni      = extracted.dni.replace(/\D/g, '')
        if (!lead.telefono && extracted.telefono && extracted.telefono !== 'null') updates.telefono = extracted.telefono
        if (!lead.email  && extracted.email  && extracted.email !== 'null')  updates.email    = extracted.email.toLowerCase()

        if (Object.keys(updates).length > 0) {
          await supabase.from('mkt_leads').update(updates).eq('id', lead.id)
          actualizados++
        }
      } catch(e) {
        console.error('Error procesando lead:', lead.id, e)
      }
    }

    setEnrichResult(`Procesados: ${aEnriquecer.length} leads · Actualizados: ${actualizados} con datos nuevos`)
    setEnriching(false)
    loadLeads()
  }

  const loadLeads = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('mkt_leads')
      .select('id,nro_tramite,fecha_consulta,apellido,nombre,dni,telefono,origen,canal,codigo_campana,vendedor,marca,fuente,campana_id,estado', { count: 'exact' })
      .order('fecha_consulta', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (filters.fuente)  q = q.eq('fuente', filters.fuente)
    if (filters.canal)   q = q.ilike('canal', '%' + filters.canal + '%')
    if (filters.campana) q = q.not('campana_id', 'is', null)
    if (filters.search)  q = q.or('apellido.ilike.%' + filters.search + '%,nombre.ilike.%' + filters.search + '%,dni.eq.' + filters.search)
    const { data, count } = await q
    setLeads(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filters])

  useEffect(() => { loadLeads() }, [loadLeads])

  async function procesar() {
    if (!file) return
    setUploading(true); setResult(null)
    const { data: rows } = await parseFile(file)
    const cols = Object.keys(rows[0] || {})
    const mapeados = rows.map(normalizeFacilitadoresRow)
    const validos  = mapeados.filter(l => l.nro_tramite)

    // Diagnóstico: cuántos tienen cada campo clave
    const conDNI   = mapeados.filter(l => l.dni).length
    const conTel   = mapeados.filter(l => l.telefono).length
    const conEmail = mapeados.filter(l => l.email).length
    const primerID = rows[0] ? (rows[0]['ID'] || rows[0]['JOB_SEQ'] || '(vacío)') : '—'

    let guardados = 0; let errorMsg = null
    if (validos.length > 0) {
      // Insertar en lotes de 500
      for (let i = 0; i < validos.length; i += 500) {
        const batch = validos.slice(i, i + 500)
        const { error } = await supabase.from('mkt_leads')
          .upsert(batch, { onConflict: 'nro_tramite,fuente', ignoreDuplicates: false })
        if (error) errorMsg = error.message
        else guardados += batch.length
      }
    }
    setResult({ procesados: rows.length, guardados, error: errorMsg, cols, conDNI, conTel, conEmail, primerID, conNro: validos.length })
    setUploading(false); setFile(null)
    if (guardados > 0) loadLeads()
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  return (
    <div className="space-y-5">

      {/* CARGA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-white text-base">Reporte Leads por Facilitadores</h2>
            <p className="text-xs text-gray-500 mt-0.5">Descargado directamente del CRM Celer, sin modificar</p>
          </div>
          <button onClick={() => setShowFmt(p => !p)} className="btn-ghost text-xs">
            {showFmt ? 'Ocultar formato' : 'Ver columnas esperadas'}
          </button>
        </div>

        {showFmt && (
          <div className="mb-4 rounded-lg border overflow-hidden" style={{ borderColor: '#2a2a2a' }}>
            <div className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide" style={{ background: '#0a0a0a' }}>
              Columnas del archivo (tal como lo descarga el Celer)
            </div>
            <div className="p-3 flex flex-wrap gap-1.5">
              {[
                { col: 'Fecha de consulta', req: true },
                { col: 'ID',                req: true },
                { col: 'Apellido',          req: false },
                { col: 'Nombre',            req: false },
                { col: 'DNI',               req: true },
                { col: 'TELNUMERO',         req: true },
                { col: 'TELCODAREA',        req: false },
                { col: 'Email',             req: false },
                { col: 'Consulta',          req: false },
                { col: 'USUARIO_DERIVO',    req: false },
                { col: 'JOB_SEQ',          req: false },
                { col: 'campania',          req: false },
                { col: 'websiteName',       req: false },
                { col: 'entryMethod',       req: false },
                { col: 'Empresa',           req: false },
              ].map(f => (
                <span key={f.col} className={'badge ' + (f.req ? 'badge-green' : 'badge-gray')}
                  style={{ fontFamily: 'monospace' }}>
                  {f.col}
                </span>
              ))}
            </div>
            <div className="px-3 py-2 text-xs text-gray-600 border-t" style={{ borderColor: '#2a2a2a' }}>
              Verde = requerida para el cruce · Gris = opcional
            </div>
          </div>
        )}

        <div
          className={'dropzone ' + (dragging ? 'active' : '') + (file ? ' filled' : '')}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if(f) setFile(f) }}
          onClick={() => fileRef.current.click()}
        >
          <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" className="hidden"
            onChange={e => { if(e.target.files[0]) setFile(e.target.files[0]) }} />
          <div className="text-2xl mb-1">{file ? '✓' : '↑'}</div>
          <div className="font-semibold text-sm text-white">
            {file ? file.name : 'Reporte_Leads_por_Facilitadores.xls'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {file ? 'Listo para procesar' : 'Clic o arrastrar el archivo del Celer'}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button onClick={procesar} disabled={uploading || !file} className="btn-primary">
            {uploading ? 'Procesando...' : 'Procesar'}
          </button>
          {file && !uploading && (
            <button onClick={() => { setFile(null); setResult(null) }} className="btn-ghost text-xs">
              Quitar archivo
            </button>
          )}
          {result && (
            <div className="text-xs space-y-1">
              {result.guardados > 0
                ? <div><span style={{ color: BRAND }}>{result.guardados}</span> <span className="text-gray-400">leads guardados de {result.procesados} leídos</span></div>
                : <div className="text-yellow-400">⚠ 0 guardados de {result.procesados} leídos</div>
              }
              {result.error && <div className="text-red-400">{result.error}</div>}
              <div className="text-gray-600">
                Con nro_tramite: <span className="text-gray-400">{result.conNro}</span> ·
                Con DNI: <span className="text-gray-400">{result.conDNI}</span> ·
                Con tel: <span className="text-gray-400">{result.conTel}</span> ·
                Con email: <span className="text-gray-400">{result.conEmail}</span>
              </div>
              <div className="text-gray-600">
                Primer valor en ID: <span className="font-mono" style={{ color: BRAND }}>{result.primerID}</span>
              </div>
              <div className="text-gray-600">
                Columnas: <span className="text-gray-500">{result.cols?.join(', ')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Botón IA */}
        <div className="mt-5 pt-4 border-t" style={{ borderColor: '#2a2a2a' }}>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-xs font-bold text-white mb-0.5">Enriquecer leads con IA</div>
              <div className="text-xs text-gray-500">
                Claude lee la columna CONSULTA de cada lead y extrae DNI, teléfono y email
                cuando la fila tiene esos campos vacíos. Mejora el cruce en Asignados.
                Prioridad: DNI → teléfono → email.
              </div>
              {enrichResult && (
                <div className="mt-2 text-xs" style={{ color: BRAND }}>{enrichResult}</div>
              )}
            </div>
            <button
              onClick={enriquecerConIA}
              disabled={enriching}
              className="btn-primary text-xs whitespace-nowrap flex-shrink-0"
              style={{ background: enriching ? '#333' : 'linear-gradient(135deg, #B5E000, #8BC34A)' }}
            >
              {enriching ? 'Procesando con IA...' : '✦ Enriquecer con IA'}
            </button>
          </div>
        </div>
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white text-base">
            Leads cargados
            <span className="text-gray-500 font-normal text-sm ml-2">{total.toLocaleString('es-AR')} registros</span>
          </h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <input className="input-dark w-48" placeholder="Nombre, DNI, teléfono..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <input className="input-dark w-36" placeholder="Canal..."
            value={filters.canal} onChange={e => sf('canal', e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={!!filters.campana}
              onChange={e => sf('campana', e.target.checked ? '1' : '')} className="accent-[#B5E000]" />
            Con campaña
          </label>
          <button onClick={() => { setFilters({ search:'', canal:'', fuente:'', campana:'' }); setPage(0) }}
            className="text-xs text-gray-600 hover:text-gray-300">Limpiar</button>
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>Fecha</th><th>ID</th><th>Cliente</th><th>DNI</th>
              <th>Teléfono</th><th>Canal</th><th>Campaña</th><th>Asesor</th><th>Estado</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-600">
                  Sin leads cargados. Subí el reporte arriba.
                </td></tr>
              )}
              {leads.map(l => (
                <tr key={l.id}>
                  <td className="text-gray-500 text-xs whitespace-nowrap">
                    {l.fecha_consulta ? l.fecha_consulta.slice(0,10).split('-').reverse().join('/') : '—'}
                  </td>
                  <td className="font-mono text-xs text-gray-400">{l.nro_tramite || '—'}</td>
                  <td className="font-medium text-white">{l.apellido} {l.nombre}</td>
                  <td className="font-mono text-xs text-gray-400">{l.dni || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{l.telefono || '—'}</td>
                  <td>
                    {l.canal
                      ? <span className="badge badge-blue">{l.canal}</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td>
                    {l.codigo_campana
                      ? <span className={'badge ' + (l.campana_id ? 'badge-green' : 'badge-yellow')}>
                          [{l.codigo_campana}]
                        </span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="text-gray-400">{l.vendedor || '—'}</td>
                  <td className="text-xs text-gray-500">{l.estado || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-600">
            {page*PAGE+1}–{Math.min((page+1)*PAGE, total)} de {total.toLocaleString('es-AR')}
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
