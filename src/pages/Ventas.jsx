import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizePVRow } from '../lib/parsers'

const BRAND = '#B5E000'
const PAGE  = 50

export default function Ventas() {
  const [ventas,    setVentas]    = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [filters,   setFilters]   = useState({ search: '', tipo: '', marca: '', desde: '', hasta: '' })
  const [file,      setFile]      = useState(null)
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
    if (filters.tipo)   q = q.ilike('tipo',  '%' + filters.tipo  + '%')
    if (filters.marca)  q = q.ilike('marca', '%' + filters.marca + '%')
    if (filters.desde)  q = q.gte('fecha', filters.desde)
    if (filters.hasta)  q = q.lte('fecha', filters.hasta)
    if (filters.search) q = q.or('nombre.ilike.%' + filters.search + '%,dni.eq.' + filters.search + ',pv_solicitud.ilike.%' + filters.search + '%')
    const { data, count } = await q
    setVentas(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filters])

  useEffect(() => { loadVentas() }, [loadVentas])

  async function procesar() {
    if (!file) return
    setUploading(true); setResult(null)
    const { data: rows } = await parseFile(file)
    const cols = Object.keys(rows[0] || {})

    const rawValidos = rows.map(normalizePVRow).filter(v => v && v.pv_solicitud)
    // Deduplicar por PV/SOLICITUD únicamente — sin importar la fuente
    const visto = new Map()
    rawValidos.forEach(v => visto.set(v.pv_solicitud, v))
    const validos = Array.from(visto.values())

    let guardados = 0; let errorMsg = null
    for (let i = 0; i < validos.length; i += 200) {
      const batch = validos.slice(i, i + 200)
      const { error } = await supabase.from('mkt_ventas')
        .upsert(batch, { onConflict: 'pv_solicitud,fuente', ignoreDuplicates: false })
      if (error) errorMsg = error.message
      else guardados += batch.length
    }

    setResult({ procesados: rows.length, guardados, error: errorMsg, cols, conPV: validos.length })
    setUploading(false); setFile(null)
    if (guardados > 0) loadVentas()
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  return (
    <div className="space-y-5">

      {/* CARGA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-white text-base">Reporte PV Vinculadas</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Descargado directamente del CRM Celer, sin modificar
            </p>
          </div>
          <button onClick={() => setShowFmt(p => !p)} className="btn-ghost text-xs">
            {showFmt ? 'Ocultar columnas' : 'Ver columnas esperadas'}
          </button>
        </div>

        {showFmt && (
          <div className="mb-4 rounded-lg border overflow-hidden" style={{ borderColor: '#2a2a2a' }}>
            <div className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide" style={{ background: '#0a0a0a' }}>
              Columnas del archivo (tal como lo descarga el Celer)
            </div>
            <div className="overflow-x-auto">
              <table className="dark-table text-xs">
                <thead><tr>
                  {['HISTORIAL','EMPRESA','PV/SOLICITUD','FECHA','TIPO','NOMBRE','CELULAR PERSONAL','TELEFONO PERSONAL','DNI','VENDEDOR','UNIDAD'].map(c => (
                    <th key={c} style={{ color: ['PV/SOLICITUD','DNI','CELULAR PERSONAL','TELEFONO PERSONAL'].includes(c) ? BRAND : '#6b7280', fontSize: '0.65rem' }}>{c}</th>
                  ))}
                </tr></thead>
                <tbody>
                  <tr>
                    <td>LAFABRICAUS</td>
                    <td>KIARA</td>
                    <td className="font-mono" style={{ color: BRAND }}>PV 00123/4</td>
                    <td>15/06/2026</td>
                    <td>0KM</td>
                    <td>GARCIA, JUAN</td>
                    <td className="font-mono">2215660762</td>
                    <td className="font-mono">2214556677</td>
                    <td className="font-mono" style={{ color: BRAND }}>32456789</td>
                    <td>LOPEZ MARIA</td>
                    <td>Berisso Team 0km</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 text-xs text-gray-600 border-t" style={{ borderColor: '#2a2a2a' }}>
              <span style={{ color: BRAND }}>Verde</span> = clave para el cruce · PV/SOLICITUD es el identificador único
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
            {file ? file.name : 'Reporte_PV_Vinculadas.xls'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {file ? 'Listo para procesar' : 'Clic o arrastrar el archivo del Celer'}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button onClick={procesar} disabled={uploading || !file} className="btn-primary">
            {uploading ? 'Procesando...' : 'Procesar'}
          </button>
          {file && !uploading && (
            <button onClick={() => { setFile(null); setResult(null) }} className="btn-ghost text-xs">
              Quitar archivo
            </button>
          )}
          {result && (
            <div className="text-xs space-y-0.5">
              {result.guardados > 0
                ? <span><span style={{ color: BRAND }}>{result.guardados}</span> <span className="text-gray-400">ventas guardadas de {result.procesados} leídas</span></span>
                : <span className="text-yellow-400">⚠ 0 guardadas de {result.procesados} leídas</span>}
              {result.error && <div className="text-red-400">{result.error}</div>}
              {result.guardados === 0 && (
                <div className="text-gray-600">
                  Con PV/SOLICITUD: <span className="text-gray-400">{result.conPV}</span> ·
                  Columnas: <span className="text-gray-500">{result.cols?.slice(0,6).join(', ')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white text-base">
            Ventas cargadas
            <span className="text-gray-500 font-normal text-sm ml-2">{total.toLocaleString('es-AR')} registros</span>
          </h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <input className="input-dark w-44" placeholder="Nombre, DNI, PV..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />

          <select className="input-dark w-36" value={filters.tipo} onChange={e => sf('tipo', e.target.value)}>
            <option value="">Tipo: todos</option>
            <option>0KM</option>
            <option>USADO</option>
            <option>PLAN AHORRO</option>
          </select>

          <select className="input-dark w-32" value={filters.marca} onChange={e => sf('marca', e.target.value)}>
            <option value="">Marca: todas</option>
            <option>KIARA</option><option>CIARA</option><option>PEARA</option><option>MOVILIS</option>
          </select>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Desde</span>
            <input type="date" className="input-dark w-36"
              value={filters.desde} onChange={e => sf('desde', e.target.value)} />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Hasta</span>
            <input type="date" className="input-dark w-36"
              value={filters.hasta} onChange={e => sf('hasta', e.target.value)} />
          </div>

          <button onClick={() => { setFilters({ search:'', tipo:'', marca:'', desde:'', hasta:'' }); setPage(0) }}
            className="text-xs text-gray-600 hover:text-gray-300 self-center">Limpiar</button>
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>PV/Solicitud</th><th>Fecha</th><th>Tipo</th><th>Cliente</th>
              <th>DNI</th><th>Teléfono</th><th>Vendedor</th><th>Marca</th><th>Lead</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && ventas.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-gray-600">
                  Sin registros. Subí el Reporte PV Vinculadas arriba.
                </td></tr>
              )}
              {ventas.map(v => (
                <tr key={v.id}>
                  <td className="font-mono text-xs" style={{ color: BRAND }}>{v.pv_solicitud}</td>
                  <td className="text-gray-500 text-xs whitespace-nowrap">
                    {v.fecha ? v.fecha.slice(0,10).split('-').reverse().join('/') : '—'}
                  </td>
                  <td>{v.tipo ? <span className="badge badge-blue">{v.tipo}</span> : '—'}</td>
                  <td className="font-medium text-white">{v.nombre || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{v.dni || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{v.telefono_personal || v.celular_personal || '—'}</td>
                  <td className="text-gray-400">{v.vendedor || '—'}</td>
                  <td className="text-gray-400 text-xs">{v.marca || '—'}</td>
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
            <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} className="btn-ghost text-xs">← Anterior</button>
            <button onClick={() => setPage(p => p+1)} disabled={(page+1)*PAGE>=total} className="btn-ghost text-xs">Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
