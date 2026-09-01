import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizeFacilitadoresRow, normalizeDerivadoRow } from '../lib/parsers'

const BRAND = '#B5E000'
const PAGE  = 50

const FORMATO = [
  { col: 'ID / JOB_SEQ', desc: 'Número de trámite único', req: true },
  { col: 'Fecha de consulta', desc: 'Fecha de ingreso del lead', req: true },
  { col: 'Apellido / Nombre', desc: 'Datos del cliente', req: false },
  { col: 'DNI', desc: 'Documento del cliente — clave para el cruce', req: true },
  { col: 'TELCODAREA + TELNUMERO', desc: 'Teléfono — segunda clave para el cruce', req: true },
  { col: 'Consulta', desc: 'Texto libre — contiene el código de campaña [xx]', req: false },
  { col: 'USUARIO_DERIVO', desc: 'Asesor que recibió el lead', req: false },
  { col: 'websiteName / Origen', desc: 'Canal de origen (Facebook, Darwin, etc.)', req: false },
]

function DropZone({ label, sublabel, file, onFile }) {
  const ref  = useRef()
  const [drag, setDrag] = useState(false)
  return (
    <div
      className={`dropzone ${drag ? 'active' : ''} ${file ? 'filled' : ''}`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if(f) onFile(f) }}
      onClick={() => ref.current.click()}
    >
      <input ref={ref} type="file" accept=".xls,.xlsx,.csv" className="hidden"
        onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      <div className="text-2xl mb-1">{file ? '✓' : '↑'}</div>
      <div className="font-semibold text-sm text-white">{label}</div>
      <div className="text-xs text-gray-500 mt-0.5">{sublabel}</div>
      {file && <div className="text-xs mt-1 truncate" style={{ color: BRAND }}>{file.name}</div>}
    </div>
  )
}

export default function Leads() {
  const [leads,   setLeads]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ search: '', canal: '', fuente: '', campana: '' })

  // Upload state
  const [fileFac, setFileFac] = useState(null)
  const [fileDer, setFileDer] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [showFormat, setShowFormat] = useState(false)

  const loadLeads = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('mkt_leads')
      .select('id,nro_tramite,fecha_consulta,apellido,nombre,dni,telefono,origen,canal,codigo_campana,vendedor,marca,fuente,campana_id,estado', { count: 'exact' })
      .order('fecha_consulta', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)

    if (filters.fuente)  q = q.eq('fuente', filters.fuente)
    if (filters.canal)   q = q.ilike('canal', `%${filters.canal}%`)
    if (filters.campana) q = q.not('campana_id', 'is', null)
    if (filters.search)  q = q.or(`apellido.ilike.%${filters.search}%,nombre.ilike.%${filters.search}%,dni.eq.${filters.search},telefono.ilike.%${filters.search}%`)

    const { data, count } = await q
    setLeads(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filters])

  useEffect(() => { loadLeads() }, [loadLeads])

  async function procesar() {
    if (!fileFac && !fileDer) { alert('Seleccioná al menos un archivo'); return }
    setUploading(true)
    setUploadResult(null)
    const allLeads = []

    if (fileFac) {
      const { data } = await parseFile(fileFac)
      allLeads.push(...data.map(normalizeFacilitadoresRow))
    }
    if (fileDer) {
      const { data } = await parseFile(fileDer)
      allLeads.push(...data.map(r => normalizeDerivadoRow(r, 'celer')))
    }

    const validLeads = allLeads.filter(l => l.nro_tramite)
    let nuevos = 0
    if (validLeads.length > 0) {
      const { error } = await supabase.from('mkt_leads')
        .upsert(validLeads, { onConflict: 'nro_tramite,fuente', ignoreDuplicates: false })
      if (!error) nuevos = validLeads.length
    }

    setUploadResult({ procesados: allLeads.length, nuevos })
    setUploading(false)
    setFileFac(null); setFileDer(null)
    loadLeads()
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  return (
    <div className="space-y-5">

      {/* UPLOAD */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-white text-base">Cargar leads</h2>
            <p className="text-xs text-gray-500 mt-0.5">Reporte Leads por Facilitadores y/o Reporte Derivado del Celer</p>
          </div>
          <button onClick={() => setShowFormat(!showFormat)} className="btn-ghost text-xs">
            {showFormat ? 'Ocultar formato' : 'Ver formato esperado'}
          </button>
        </div>

        {showFormat && (
          <div className="mb-4 rounded-lg overflow-hidden border" style={{ borderColor: '#2a2a2a' }}>
            <table className="dark-table">
              <thead><tr>
                <th>Columna</th><th>Descripción</th><th>Requerida</th>
              </tr></thead>
              <tbody>
                {FORMATO.map(f => (
                  <tr key={f.col}>
                    <td className="font-mono text-xs" style={{ color: BRAND }}>{f.col}</td>
                    <td>{f.desc}</td>
                    <td><span className={`badge ${f.req ? 'badge-green' : 'badge-gray'}`}>{f.req ? 'Sí' : 'No'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <DropZone label="Reporte Facilitadores" sublabel="Celer — leads por origen" file={fileFac} onFile={setFileFac} />
          <DropZone label="Reporte Derivado" sublabel="Celer — leads derivados a asesores" file={fileDer} onFile={setFileDer} />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={procesar} disabled={uploading || (!fileFac && !fileDer)} className="btn-primary">
            {uploading ? 'Procesando...' : 'Procesar archivos'}
          </button>
          {uploadResult && (
            <div className="text-xs text-gray-400">
              <span style={{ color: BRAND }}>{uploadResult.nuevos}</span> leads procesados
              de {uploadResult.procesados} registros leídos
            </div>
          )}
        </div>
      </div>

      {/* FILTROS + TABLA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white text-base">
            Leads cargados <span className="text-gray-500 font-normal text-sm ml-2">{total.toLocaleString('es-AR')} registros</span>
          </h2>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input className="input-dark w-48" placeholder="Buscar nombre, DNI, teléfono..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <select className="input-dark w-36" value={filters.fuente} onChange={e => sf('fuente', e.target.value)}>
            <option value="">Fuente: todas</option>
            <option value="celer">Celer</option>
            <option value="autodealer">Autodealer</option>
          </select>
          <input className="input-dark w-36" placeholder="Canal..."
            value={filters.canal} onChange={e => sf('canal', e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={!!filters.campana}
              onChange={e => sf('campana', e.target.checked ? '1' : '')} className="accent-[#B5E000]" />
            Solo con campaña
          </label>
          <button onClick={() => { setFilters({ search:'', canal:'', fuente:'', campana:'' }); setPage(0) }}
            className="text-xs text-gray-600 hover:text-gray-300 transition-colors">
            Limpiar
          </button>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>Fecha</th><th>Cliente</th><th>DNI</th><th>Teléfono</th>
              <th>Canal</th><th>Campaña</th><th>Asesor</th><th>Fuente</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && leads.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-gray-600">Sin resultados</td></tr>}
              {leads.map(l => (
                <tr key={l.id}>
                  <td className="text-gray-500 text-xs whitespace-nowrap">
                    {l.fecha_consulta ? new Date(l.fecha_consulta).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td className="font-medium text-white">{l.apellido} {l.nombre}</td>
                  <td className="font-mono text-xs text-gray-400">{l.dni || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{l.telefono || '—'}</td>
                  <td>
                    {l.canal ? <span className="badge badge-blue">{l.canal}</span> : <span className="text-gray-600">—</span>}
                  </td>
                  <td>
                    {l.codigo_campana
                      ? <span className={`badge ${l.campana_id ? 'badge-green' : 'badge-yellow'}`}>[{l.codigo_campana}]</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="text-gray-400">{l.vendedor || '—'}</td>
                  <td><span className={`badge ${l.fuente === 'celer' ? 'badge-blue' : 'badge-gray'}`}>{l.fuente}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-600">
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} de {total.toLocaleString('es-AR')}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} className="btn-ghost text-xs">← Anterior</button>
            <button onClick={() => setPage(p => p+1)} disabled={(page+1)*PAGE >= total} className="btn-ghost text-xs">Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
