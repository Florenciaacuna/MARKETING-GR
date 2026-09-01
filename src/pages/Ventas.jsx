import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizeDNI, normalizePhone } from '../lib/parsers'

const BRAND = '#B5E000'
const PAGE  = 50

// Normalización unificada — mismo formato para K1 y Autodealer
function normalizeVentaRow(row) {
  return {
    pv_solicitud:      row['PV/SOLICITUD'] || null,
    fecha:             row['FECHA'] || row['Fecha'] || null,
    tipo:              row['TIPO'] || null,
    nombre:            row['NOMBRE'] || null,
    dni:               normalizeDNI(row['DNI']),
    telefono_personal: normalizePhone(row['TELEFONO PERSONAL'] || row['Telefono Personal']),
    celular_personal:  normalizePhone(row['CELULAR PERSONAL'] || row['Celular Personal']),
    vendedor:          row['VENDEDOR'] || row['Vendedor'] || null,
    marca:             row['Marca'] || row['MARCA'] || row['UNIDAD'] || null,
    fuente:            row['UNIDAD'] ? 'autodealer' : 'k1',
  }
}

const FORMATO = [
  { col: 'PV/SOLICITUD', desc: 'Número de preventa — identificador único',   req: true  },
  { col: 'FECHA',        desc: 'Fecha de la operación',                       req: true  },
  { col: 'TIPO',         desc: '0KM / USADO / PLAN AHORRO',                  req: false },
  { col: 'NOMBRE',       desc: 'Nombre del cliente',                          req: false },
  { col: 'DNI',          desc: 'Documento — clave principal para el cruce',   req: true  },
  { col: 'TELEFONO PERSONAL', desc: 'Teléfono — segunda clave para el cruce', req: true  },
  { col: 'CELULAR PERSONAL',  desc: 'Celular — clave alternativa',            req: false },
  { col: 'VENDEDOR',     desc: 'Asesor que cerró la operación',               req: false },
  { col: 'Marca / UNIDAD', desc: 'KIARA / CIARA / PEARA / MOVILIS',          req: false },
]

export default function Ventas() {
  const [ventas,    setVentas]    = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [filters,   setFilters]   = useState({ search: '', tipo: '', marca: '', fuente: '' })

  const [files,     setFiles]     = useState([])
  const [dragging,  setDragging]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result,    setResult]    = useState(null)
  const [showFmt,   setShowFmt]   = useState(false)
  const fileRef = useRef()

  const loadVentas = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('mkt_ventas')
      .select('id,pv_solicitud,fecha,tipo,nombre,dni,telefono_personal,celular_personal,vendedor,marca,fuente,lead_id,metodo_match', { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)

    if (filters.fuente)  q = q.eq('fuente', filters.fuente)
    if (filters.tipo)    q = q.eq('tipo', filters.tipo)
    if (filters.marca)   q = q.eq('marca', filters.marca)
    if (filters.search)  q = q.or(`nombre.ilike.%${filters.search}%,dni.eq.${filters.search},pv_solicitud.ilike.%${filters.search}%`)

    const { data, count } = await q
    setVentas(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filters])

  useEffect(() => { loadVentas() }, [loadVentas])

  const addFiles = (newFiles) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      const toAdd = Array.from(newFiles).filter(f => !existing.has(f.name))
      return [...prev, ...toAdd]
    })
    setResult(null)
  }

  async function procesar() {
    if (files.length === 0) { alert('Seleccioná al menos un archivo'); return }
    setUploading(true); setResult(null)
    let procesados = 0; let guardados = 0; let errores = 0

    for (const file of files) {
      const { data: rows } = await parseFile(file)
      procesados += rows.length
      const valid = rows.map(normalizeVentaRow).filter(v => v.pv_solicitud)

      if (valid.length > 0) {
        const { error } = await supabase.from('mkt_ventas')
          .upsert(valid, { onConflict: 'pv_solicitud,fuente', ignoreDuplicates: false })
        if (error) errores += valid.length
        else guardados += valid.length
      }
    }

    setResult({ procesados, guardados, errores, archivos: files.length })
    setUploading(false); setFiles([])
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
            <p className="text-xs text-gray-500 mt-0.5">
              Mismo formato para K1 y Autodealer. Podés subir varios archivos a la vez.
            </p>
          </div>
          <button onClick={() => setShowFmt(!showFmt)} className="btn-ghost text-xs">
            {showFmt ? 'Ocultar formato' : 'Ver formato esperado'}
          </button>
        </div>

        {/* Formato */}
        {showFmt && (
          <div className="mb-4 rounded-lg overflow-hidden border" style={{ borderColor:'#2a2a2a' }}>
            <table className="dark-table text-xs">
              <thead><tr><th>Columna</th><th>Descripción</th><th>Requerida</th></tr></thead>
              <tbody>
                {FORMATO.map(f => (
                  <tr key={f.col}>
                    <td><span className="font-mono" style={{ color: BRAND }}>{f.col}</span></td>
                    <td className="text-gray-400">{f.desc}</td>
                    <td><span className={`badge ${f.req ? 'badge-green' : 'badge-gray'}`}>{f.req ? 'Sí' : 'No'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Drop zone */}
        <div
          className={`dropzone mb-3 ${dragging ? 'active' : ''} ${files.length > 0 ? 'filled' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
          onClick={() => fileRef.current.click()}
        >
          <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" multiple className="hidden"
            onChange={e => addFiles(e.target.files)} />
          <div className="text-2xl mb-1">{files.length > 0 ? '✓' : '↑'}</div>
          <div className="font-semibold text-sm text-white">
            {files.length > 0 ? `${files.length} archivo${files.length > 1 ? 's' : ''} seleccionado${files.length > 1 ? 's' : ''}` : 'Subir archivos de ventas'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            K1 · Autodealer · Podés seleccionar varios a la vez
          </div>
          {files.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {files.map(f => (
                <div key={f.name} className="text-xs truncate" style={{ color: BRAND }}>• {f.name}</div>
              ))}
            </div>
          )}
        </div>

        {/* Archivos seleccionados con opción de quitar */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {files.map(f => (
              <div key={f.name} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                style={{ background:'#1a1a1a', border:'1px solid #2a2a2a' }}>
                <span className="text-gray-300 truncate max-w-[160px]">{f.name}</span>
                <button
                  onClick={() => setFiles(prev => prev.filter(x => x.name !== f.name))}
                  className="text-gray-600 hover:text-red-400 transition-colors ml-1">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={procesar} disabled={uploading || files.length === 0} className="btn-primary">
            {uploading ? 'Procesando...' : `Procesar${files.length > 1 ? ` ${files.length} archivos` : ''}`}
          </button>
          {files.length > 0 && !uploading && (
            <button onClick={() => setFiles([])} className="btn-ghost text-xs">Limpiar</button>
          )}
          {result && (
            <div className="text-xs text-gray-400">
              <span style={{ color: BRAND }}>{result.guardados}</span> registros guardados
              de {result.procesados} leídos en {result.archivos} archivo{result.archivos > 1 ? 's' : ''}
              {result.errores > 0 && <span className="text-red-400 ml-2">· {result.errores} errores</span>}
            </div>
          )}
        </div>
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white text-base">
            Ventas y preventas
            <span className="text-gray-500 font-normal text-sm ml-2">{total.toLocaleString('es-AR')} registros</span>
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
          <select className="input-dark w-36" value={filters.tipo} onChange={e => sf('tipo', e.target.value)}>
            <option value="">Tipo: todos</option>
            <option>0KM</option><option>USADO</option><option>PLAN AHORRO</option>
          </select>
          <select className="input-dark w-32" value={filters.marca} onChange={e => sf('marca', e.target.value)}>
            <option value="">Marca: todas</option>
            <option>KIARA</option><option>CIARA</option><option>PEARA</option><option>MOVILIS</option>
          </select>
          <button onClick={() => { setFilters({ search:'', tipo:'', marca:'', fuente:'' }); setPage(0) }}
            className="text-xs text-gray-600 hover:text-gray-300 transition-colors">
            Limpiar
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>PV/Solicitud</th><th>Fecha</th><th>Tipo</th><th>Cliente</th>
              <th>DNI</th><th>Teléfono</th><th>Vendedor</th><th>Marca</th>
              <th>Sistema</th><th>Lead</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && ventas.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-600">
                  Sin resultados. Subí los archivos de ventas arriba.
                </td></tr>
              )}
              {ventas.map(v => (
                <tr key={v.id}>
                  <td className="font-mono text-xs" style={{ color: BRAND }}>{v.pv_solicitud}</td>
                  <td className="text-gray-500 text-xs">
                    {v.fecha ? new Date(v.fecha).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td><span className="badge badge-blue">{v.tipo || '—'}</span></td>
                  <td className="font-medium text-white">{v.nombre || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{v.dni || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">
                    {v.telefono_personal || v.celular_personal || '—'}
                  </td>
                  <td className="text-gray-400">{v.vendedor || '—'}</td>
                  <td>{v.marca ? <span className="badge badge-gray">{v.marca}</span> : '—'}</td>
                  <td>
                    <span className={`badge ${v.fuente === 'k1' ? 'badge-green' : 'badge-blue'}`}>
                      {v.fuente}
                    </span>
                  </td>
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
          <span className="text-xs text-gray-600">
            {page*PAGE+1}–{Math.min((page+1)*PAGE, total)} de {total.toLocaleString('es-AR')}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} className="btn-ghost text-xs">
              ← Anterior
            </button>
            <button onClick={() => setPage(p => p+1)} disabled={(page+1)*PAGE>=total} className="btn-ghost text-xs">
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
