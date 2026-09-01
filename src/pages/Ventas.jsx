import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizeK1Row, normalizePVRow } from '../lib/parsers'

const BRAND = '#B5E000'
const PAGE  = 50

const FORMATO_K1 = [
  { col: 'PV/SOLICITUD', desc: 'Número de preventa/solicitud — identificador único', req: true },
  { col: 'FECHA', desc: 'Fecha de la operación', req: true },
  { col: 'TIPO', desc: '0KM / USADO / PLAN', req: true },
  { col: 'NOMBRE', desc: 'Nombre del cliente', req: false },
  { col: 'DNI', desc: 'Documento — clave principal para el cruce', req: true },
  { col: 'TELEFONO PERSONAL', desc: 'Teléfono — segunda clave para el cruce', req: true },
  { col: 'CELULAR PERSONAL', desc: 'Celular — clave alternativa', req: true },
  { col: 'VENDEDOR', desc: 'Asesor que cerró la venta', req: false },
  { col: 'Marca', desc: 'KIARA / CIARA / PEARA / MOVILIS', req: false },
]

const FORMATO_PV = [
  { col: 'PV/SOLICITUD', desc: 'Número de preventa', req: true },
  { col: 'FECHA', desc: 'Fecha de la operación', req: true },
  { col: 'TIPO', desc: 'Tipo de operación', req: true },
  { col: 'NOMBRE', desc: 'Nombre del cliente', req: false },
  { col: 'DNI', desc: 'Documento — clave para el cruce', req: true },
  { col: 'TELEFONO PERSONAL', desc: 'Teléfono del cliente', req: true },
  { col: 'CELULAR PERSONAL', desc: 'Celular del cliente', req: true },
  { col: 'VENDEDOR', desc: 'Asesor', req: false },
  { col: 'UNIDAD', desc: 'Marca / línea del vehículo', req: false },
]

function DropZone({ label, sublabel, badge, file, onFile }) {
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
      <div className="flex justify-center mb-1">
        <span className="badge badge-blue text-xs">{badge}</span>
      </div>
      <div className="font-semibold text-sm text-white">{label}</div>
      <div className="text-xs text-gray-500 mt-0.5">{sublabel}</div>
      {file
        ? <div className="text-xs mt-1 truncate" style={{ color: BRAND }}>{file.name}</div>
        : <div className="text-xs mt-1 text-gray-600">Clic o arrastrar archivo .xls</div>}
    </div>
  )
}

export default function Ventas() {
  const [ventas,   setVentas]   = useState([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [filters,  setFilters]  = useState({ search: '', tipo: '', marca: '', fuente: '' })

  const [fileK1,   setFileK1]   = useState(null)
  const [filePV,   setFilePV]   = useState(null)
  const [uploading,setUploading]= useState(false)
  const [result,   setResult]   = useState(null)
  const [showFmt,  setShowFmt]  = useState(null) // 'k1' | 'pv' | null

  const loadVentas = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('mkt_ventas')
      .select('id,pv_solicitud,fecha,tipo,nombre,dni,telefono_personal,celular_personal,vendedor,marca,fuente,lead_id,metodo_match', { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)

    if (filters.fuente) q = q.eq('fuente', filters.fuente)
    if (filters.tipo)   q = q.eq('tipo', filters.tipo)
    if (filters.marca)  q = q.eq('marca', filters.marca)
    if (filters.search) q = q.or(`nombre.ilike.%${filters.search}%,dni.eq.${filters.search},pv_solicitud.ilike.%${filters.search}%`)

    const { data, count } = await q
    setVentas(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filters])

  useEffect(() => { loadVentas() }, [loadVentas])

  async function procesar() {
    if (!fileK1 && !filePV) { alert('Seleccioná al menos un archivo'); return }
    setUploading(true); setResult(null)
    const all = []

    if (fileK1) { const { data } = await parseFile(fileK1); all.push(...data.map(normalizeK1Row)) }
    if (filePV) { const { data } = await parseFile(filePV); all.push(...data.map(normalizePVRow)) }

    const valid = all.filter(v => v.pv_solicitud)
    if (valid.length > 0) {
      await supabase.from('mkt_ventas').upsert(valid, { onConflict: 'pv_solicitud,fuente', ignoreDuplicates: false })
    }
    setResult({ procesados: all.length, nuevos: valid.length })
    setUploading(false); setFileK1(null); setFilePV(null)
    loadVentas()
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  return (
    <div className="space-y-5">

      {/* UPLOAD */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-white text-base">Cargar ventas y preventas</h2>
            <p className="text-xs text-gray-500 mt-0.5">Exportaciones del K1 y del sistema Autodealer</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400">Ventas K1</span>
              <button onClick={() => setShowFmt(showFmt === 'k1' ? null : 'k1')} className="text-xs" style={{ color: BRAND }}>
                {showFmt === 'k1' ? 'Ocultar formato' : 'Ver formato'}
              </button>
            </div>
            {showFmt === 'k1' && (
              <div className="mb-2 rounded-lg overflow-hidden border text-xs" style={{ borderColor: '#2a2a2a' }}>
                <table className="dark-table">
                  <thead><tr><th>Columna</th><th>Requerida</th></tr></thead>
                  <tbody>{FORMATO_K1.map(f=>(
                    <tr key={f.col}>
                      <td><span className="font-mono" style={{color:BRAND}}>{f.col}</span> — {f.desc}</td>
                      <td><span className={`badge ${f.req?'badge-green':'badge-gray'}`}>{f.req?'Sí':'No'}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <DropZone label="Ventas K1" sublabel="Excel descargado del K1" badge="K1" file={fileK1} onFile={setFileK1} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400">PV Vinculadas — Autodealer</span>
              <button onClick={() => setShowFmt(showFmt === 'pv' ? null : 'pv')} className="text-xs" style={{ color: BRAND }}>
                {showFmt === 'pv' ? 'Ocultar formato' : 'Ver formato'}
              </button>
            </div>
            {showFmt === 'pv' && (
              <div className="mb-2 rounded-lg overflow-hidden border text-xs" style={{ borderColor: '#2a2a2a' }}>
                <table className="dark-table">
                  <thead><tr><th>Columna</th><th>Requerida</th></tr></thead>
                  <tbody>{FORMATO_PV.map(f=>(
                    <tr key={f.col}>
                      <td><span className="font-mono" style={{color:BRAND}}>{f.col}</span> — {f.desc}</td>
                      <td><span className={`badge ${f.req?'badge-green':'badge-gray'}`}>{f.req?'Sí':'No'}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <DropZone label="PV Vinculadas" sublabel="Autodealer — preventas" badge="Autodealer" file={filePV} onFile={setFilePV} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={procesar} disabled={uploading || (!fileK1 && !filePV)} className="btn-primary">
            {uploading ? 'Procesando...' : 'Procesar archivos'}
          </button>
          {result && (
            <div className="text-xs text-gray-400">
              <span style={{ color: BRAND }}>{result.nuevos}</span> registros guardados
            </div>
          )}
        </div>
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white text-base">
            Ventas y preventas <span className="text-gray-500 font-normal text-sm ml-2">{total.toLocaleString('es-AR')} registros</span>
          </h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <input className="input-dark w-48" placeholder="Buscar nombre, DNI, PV..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <select className="input-dark w-32" value={filters.fuente} onChange={e => sf('fuente', e.target.value)}>
            <option value="">Sistema: todos</option>
            <option value="k1">K1</option>
            <option value="autodealer">Autodealer</option>
          </select>
          <select className="input-dark w-32" value={filters.tipo} onChange={e => sf('tipo', e.target.value)}>
            <option value="">Tipo: todos</option>
            <option>0KM</option><option>USADO</option><option>PLAN</option>
          </select>
          <select className="input-dark w-32" value={filters.marca} onChange={e => sf('marca', e.target.value)}>
            <option value="">Marca: todas</option>
            <option>KIARA</option><option>CIARA</option><option>PEARA</option><option>MOVILIS</option>
          </select>
          <button onClick={() => { setFilters({ search:'', tipo:'', marca:'', fuente:'' }); setPage(0) }}
            className="text-xs text-gray-600 hover:text-gray-300">Limpiar</button>
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>PV/Solicitud</th><th>Fecha</th><th>Tipo</th><th>Cliente</th>
              <th>DNI</th><th>Teléfono</th><th>Vendedor</th><th>Marca</th><th>Sistema</th><th>Lead</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && ventas.length === 0 && <tr><td colSpan={10} className="text-center py-10 text-gray-600">Sin resultados. Cargá las ventas arriba.</td></tr>}
              {ventas.map(v => (
                <tr key={v.id}>
                  <td className="font-mono text-xs" style={{ color: BRAND }}>{v.pv_solicitud}</td>
                  <td className="text-gray-500 text-xs">{v.fecha ? new Date(v.fecha).toLocaleDateString('es-AR') : '—'}</td>
                  <td><span className="badge badge-blue">{v.tipo || '—'}</span></td>
                  <td className="font-medium text-white">{v.nombre || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{v.dni || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{v.telefono_personal || v.celular_personal || '—'}</td>
                  <td className="text-gray-400">{v.vendedor || '—'}</td>
                  <td>{v.marca ? <span className="badge badge-gray">{v.marca}</span> : '—'}</td>
                  <td><span className={`badge ${v.fuente === 'k1' ? 'badge-green' : 'badge-blue'}`}>{v.fuente}</span></td>
                  <td>
                    {v.lead_id
                      ? <span className="badge badge-green">Sí — {v.metodo_match}</span>
                      : <span className="badge badge-gray">Sin lead</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-600">{page*PAGE+1}–{Math.min((page+1)*PAGE,total)} de {total.toLocaleString('es-AR')}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p=>Math.max(0,p-1))} disabled={page===0} className="btn-ghost text-xs">← Anterior</button>
            <button onClick={() => setPage(p=>p+1)} disabled={(page+1)*PAGE>=total} className="btn-ghost text-xs">Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
