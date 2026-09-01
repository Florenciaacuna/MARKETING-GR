import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizeDNI, normalizePhone } from '../lib/parsers'

const BRAND = '#B5E000'
const PAGE  = 50

// Convertir fecha a formato ISO yyyy-mm-dd
function normalizeDate(val) {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val).trim()
  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`
  // dd-mm-yyyy
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (m2) return `${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`
  // yyyy-mm-dd ya está bien
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10)
  return null
}

// Normalización — columnas reales del sistema K1/Autodealer
// Formato: HISTORIAL | EMPRESA | PV/SOLICITUD | FECHA | TIPO | NOMBRE |
//          CELULAR PERSONAL | TELEFONO PERSONAL | DNI | VENDEDOR | UNIDAD
function normalizeVentaRow(row) {
  return {
    pv_solicitud:      row['PV/SOLICITUD'] || null,
    fecha:             normalizeDate(row['FECHA'] || row['Fecha']),
    tipo:              row['TIPO'] || null,
    nombre:            row['NOMBRE'] || null,
    dni:               normalizeDNI(row['DNI']),
    telefono_personal: normalizePhone(row['TELEFONO PERSONAL']),
    celular_personal:  normalizePhone(row['CELULAR PERSONAL']),
    vendedor:          row['VENDEDOR'] || null,
    // EMPRESA = marca del concesionario (KIARA, CIARA, PEARA, MOVILIS)
    // UNIDAD  = modelo del auto (ej: "FIAT CRONOS 1.3")
    marca:             row['EMPRESA'] || row['Marca'] || row['MARCA'] || null,
    fuente:            'k1',
  }
}

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
  const [columnas,  setColumnas]  = useState(null) // para diagnóstico
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
    setResult(null); setColumnas(null)
  }

  async function procesar() {
    if (files.length === 0) return
    setUploading(true); setResult(null); setColumnas(null)

    let totalProcesados = 0; let totalGuardados = 0
    let errorMsg = null; let colsDetectadas = null

    for (const file of files) {
      const { data: rows } = await parseFile(file)
      totalProcesados += rows.length

      if (rows.length > 0 && !colsDetectadas) {
        colsDetectadas = Object.keys(rows[0])
      }

      const valid = rows
        .map(normalizeVentaRow)
        .filter(v => v.pv_solicitud) // solo filas con PV

      if (valid.length === 0) continue

      // Insertar en lotes de 200 para evitar timeouts
      for (let i = 0; i < valid.length; i += 200) {
        const batch = valid.slice(i, i + 200)
        const { error } = await supabase.from('mkt_ventas')
          .upsert(batch, { onConflict: 'pv_solicitud,fuente', ignoreDuplicates: false })

        if (error) {
          errorMsg = error.message
          console.error('Error upsert batch:', error)
        } else {
          totalGuardados += batch.length
        }
      }
    }

    setColumnas(colsDetectadas)
    setResult({ procesados: totalProcesados, guardados: totalGuardados, error: errorMsg })
    setUploading(false); setFiles([])
    if (totalGuardados > 0) loadVentas()
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  return (
    <div className="space-y-5">

      {/* UPLOAD */}
      <div className="card">
        <div className="mb-4">
          <h2 className="font-bold text-white text-base">Cargar ventas y preventas</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Mismo formato para K1 y Autodealer · Podés subir varios archivos a la vez
          </p>
        </div>

        {/* Formato requerido */}
        <div className="mb-4 rounded-xl border overflow-hidden" style={{ borderColor:'#2a2a2a' }}>
          <div className="px-4 py-3 flex items-center justify-between cursor-pointer"
            style={{ background:'#111' }}
            onClick={() => setShowFmt(p => !p)}>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Formato requerido del Excel
            </span>
            <span className="text-gray-500 text-xs">{showFmt ? '▲ Ocultar' : '▼ Ver formato'}</span>
          </div>

          {showFmt && (
            <div style={{ background:'#0d0d0d' }}>
              {/* Tabla de ejemplo */}
              <div className="overflow-x-auto">
                <table className="dark-table text-xs">
                  <thead>
                    <tr>
                      {['EMPRESA','PV/SOLICITUD','FECHA','TIPO','NOMBRE','DNI','TELEFONO PERSONAL','CELULAR PERSONAL','VENDEDOR','UNIDAD'].map(col => (
                        <th key={col} style={{ color: BRAND, fontSize:'0.65rem' }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>KIARA</td>
                      <td className="font-mono">PV 00123/4</td>
                      <td>15/06/2026</td>
                      <td>0KM</td>
                      <td>GARCIA, JUAN</td>
                      <td className="font-mono">32456789</td>
                      <td className="font-mono">(221)4556677</td>
                      <td className="font-mono">(221)1534567</td>
                      <td>LOPEZ MARIA</td>
                      <td>FIAT CRONOS 1.3</td>
                    </tr>
                    <tr>
                      <td>CIARA</td>
                      <td className="font-mono">US 00456/7</td>
                      <td>22/07/2026</td>
                      <td>USADO</td>
                      <td>MARTINEZ, ANA</td>
                      <td className="font-mono">28901234</td>
                      <td className="font-mono">(011)45678901</td>
                      <td></td>
                      <td>RODRIGUEZ CARLOS</td>
                      <td>VW GOL 1.6</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Reglas */}
              <div className="px-4 py-3 border-t" style={{ borderColor:'#1f1f1f' }}>
                <div className="text-xs font-bold text-gray-500 mb-2">Reglas del archivo:</div>
                <ul className="space-y-1 text-xs text-gray-500">
                  {[
                    { label:'PV/SOLICITUD', desc:'Número de preventa o solicitud. Requerido — es el identificador único de cada operación.', req:true },
                    { label:'FECHA',        desc:'Formato DD/MM/AAAA. Requerido para el cruce con leads.', req:true },
                    { label:'TIPO',         desc:'0KM · USADO · PLAN AHORRO. Texto libre, se muestra en la tabla.', req:false },
                    { label:'DNI',          desc:'Sin puntos ni guiones. Clave principal para cruzar con leads.', req:true },
                    { label:'TELEFONO PERSONAL / CELULAR PERSONAL', desc:'Con o sin código de área. Clave secundaria para el cruce.', req:true },
                    { label:'VENDEDOR',     desc:'Nombre del asesor que cerró la operación.', req:false },
                    { label:'Marca',        desc:'KIARA · CIARA · PEARA · MOVILIS. Permite filtrar por marca en la tabla.', req:false },
                  ].map(r => (
                    <li key={r.label} className="flex items-start gap-2">
                      <span className={`badge mt-0.5 flex-shrink-0 ${r.req ? 'badge-green' : 'badge-gray'}`}>
                        {r.req ? 'REQ' : 'OPC'}
                      </span>
                      <span>
                        <strong className="text-gray-300">{r.label}:</strong> {r.desc}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

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
            {files.length > 0
              ? `${files.length} archivo${files.length > 1 ? 's' : ''} listo${files.length > 1 ? 's' : ''}`
              : 'Arrastrá o hacé clic para seleccionar'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">.xls · .xlsx · .csv</div>
          {files.map(f => (
            <div key={f.name} className="text-xs mt-1 truncate" style={{ color: BRAND }}>• {f.name}</div>
          ))}
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {files.map(f => (
              <div key={f.name} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                style={{ background:'#111', border:'1px solid #2a2a2a' }}>
                <span className="text-gray-300 truncate max-w-xs">{f.name}</span>
                <button onClick={() => setFiles(p => p.filter(x => x.name !== f.name))}
                  className="text-gray-600 hover:text-red-400 ml-1">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={procesar} disabled={uploading || files.length === 0} className="btn-primary">
            {uploading ? 'Procesando...' : 'Procesar archivos'}
          </button>
          {files.length > 0 && !uploading && (
            <button onClick={() => { setFiles([]); setColumnas(null) }} className="btn-ghost text-xs">
              Limpiar
            </button>
          )}
        </div>

        {/* Resultado */}
        {result && (
          <div className="mt-4 space-y-3">
            <div className={`p-3 rounded-lg text-xs border ${result.error ? 'border-red-800' : 'border-[#2a2a2a]'}`}
              style={{ background: result.error ? '#2e0c0c' : '#111' }}>
              {result.guardados > 0 && (
                <div className="font-bold mb-1" style={{ color: BRAND }}>
                  ✓ {result.guardados} registros guardados de {result.procesados} leídos
                </div>
              )}
              {result.guardados === 0 && !result.error && (
                <div className="text-yellow-400 font-bold mb-1">
                  ⚠ 0 registros guardados de {result.procesados} leídos
                </div>
              )}
              {result.error && (
                <div className="text-red-400">
                  <div className="font-bold mb-1">Error al guardar:</div>
                  <div className="font-mono text-xs break-all">{result.error}</div>
                </div>
              )}
            </div>

            {/* Columnas detectadas */}
            {columnas && (
              <div className="p-3 rounded-lg border text-xs" style={{ background:'#111', borderColor:'#2a2a2a' }}>
                <div className="font-bold text-gray-400 mb-2">Columnas detectadas en el archivo:</div>
                <div className="flex flex-wrap gap-1.5">
                  {columnas.map(c => (
                    <span key={c} className="px-2 py-0.5 rounded font-mono"
                      style={{ background:'#1a1a1a', border:'1px solid #333', color: BRAND }}>
                      {c}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-gray-600">
                  Copiá estas columnas y mandámelas para verificar que el parser las está leyendo bien.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white text-base">
            Ventas y preventas
            <span className="text-gray-500 font-normal text-sm ml-2">
              {total.toLocaleString('es-AR')} registros
            </span>
          </h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <input className="input-dark w-48" placeholder="Nombre, DNI, PV..."
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
            className="text-xs text-gray-600 hover:text-gray-300">Limpiar</button>
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
                <tr><td colSpan={10} className="text-center py-8 text-gray-600">
                  Sin resultados. Subí los archivos arriba.
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
          <span className="text-xs text-gray-600">
            {page*PAGE+1}–{Math.min((page+1)*PAGE,total)} de {total.toLocaleString('es-AR')}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p=>Math.max(0,p-1))} disabled={page===0} className="btn-ghost text-xs">← Anterior</button>
            <button onClick={() => setPage(p=>p+1)} disabled={(page+1)*PAGE>=total} className="btn-ghost text-xs">Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
