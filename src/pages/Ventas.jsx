import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizePVRow, normalizeDerivadoVentaRow } from '../lib/parsers'

const BRAND = '#B5E000'
const PAGE  = 50

function DropZone({ label, sublabel, badge, file, onFile, onClear }) {
  const ref = useRef()
  const [drag, setDrag] = useState(false)
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-400">{label}</span>
        <span className={'badge ' + badge}>{label.includes('PV') ? 'PV Vinculadas' : 'Derivado'}</span>
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
        <div className="font-semibold text-sm text-white">
          {file ? file.name : sublabel}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {file ? 'Listo para procesar' : 'Clic o arrastrar .xls del Celer'}
        </div>
      </div>
      {file && (
        <button onClick={onClear}
          className="text-xs text-gray-600 hover:text-red-400 mt-1 transition-colors">
          ✕ Quitar archivo
        </button>
      )}
    </div>
  )
}

export default function Ventas() {
  const [ventas,    setVentas]    = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [filters,   setFilters]   = useState({ search: '', tipo: '', marca: '', fuente: '' })
  const [filePV,    setFilePV]    = useState(null)
  const [fileDer,   setFileDer]   = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result,    setResult]    = useState(null)
  const [showFmt,   setShowFmt]   = useState(false)

  const loadVentas = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('mkt_ventas')
      .select('id,pv_solicitud,fecha,tipo,nombre,dni,telefono_personal,celular_personal,vendedor,marca,fuente,lead_id,metodo_match', { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (filters.fuente)  q = q.eq('fuente', filters.fuente)
    if (filters.tipo)    q = q.ilike('tipo', '%' + filters.tipo + '%')
    if (filters.marca)   q = q.ilike('marca', '%' + filters.marca + '%')
    if (filters.search)  q = q.or('nombre.ilike.%' + filters.search + '%,dni.eq.' + filters.search + ',pv_solicitud.ilike.%' + filters.search + '%')
    const { data, count } = await q
    setVentas(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filters])

  useEffect(() => { loadVentas() }, [loadVentas])

  async function procesar() {
    if (!filePV && !fileDer) { alert('Seleccioná al menos un archivo'); return }
    setUploading(true); setResult(null)
    let procesados = 0; let guardados = 0; let errorMsg = null

    // PV Vinculadas
    if (filePV) {
      const { data: rows } = await parseFile(filePV)
      procesados += rows.length
      const validos = rows.map(normalizePVRow).filter(v => v.pv_solicitud)
      if (validos.length > 0) {
        for (let i = 0; i < validos.length; i += 200) {
          const batch = validos.slice(i, i+200)
          const { error } = await supabase.from('mkt_ventas')
            .upsert(batch, { onConflict: 'pv_solicitud,fuente', ignoreDuplicates: false })
          if (error) errorMsg = error.message
          else guardados += batch.length
        }
      }
    }

    // Reporte Derivado
    if (fileDer) {
      const { data: rows } = await parseFile(fileDer)
      procesados += rows.length
      const validos = rows.map(normalizeDerivadoVentaRow).filter(v => v.pv_solicitud)
      if (validos.length > 0) {
        for (let i = 0; i < validos.length; i += 200) {
          const batch = validos.slice(i, i+200)
          const { error } = await supabase.from('mkt_ventas')
            .upsert(batch, { onConflict: 'pv_solicitud,fuente', ignoreDuplicates: false })
          if (error) errorMsg = (errorMsg || '') + ' | ' + error.message
          else guardados += batch.length
        }
      }
    }

    setResult({ procesados, guardados, error: errorMsg })
    setUploading(false); setFilePV(null); setFileDer(null)
    if (guardados > 0) loadVentas()
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  return (
    <div className="space-y-5">

      {/* CARGA */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-white text-base">Cargar ventas y preventas</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Dos reportes del CRM Celer — se suben en crudo tal como se descargan
            </p>
          </div>
          <button onClick={() => setShowFmt(p => !p)} className="btn-ghost text-xs">
            {showFmt ? 'Ocultar columnas' : 'Ver columnas'}
          </button>
        </div>

        {/* Columnas de referencia */}
        {showFmt && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: '#2a2a2a' }}>
              <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase" style={{ background: '#0a0a0a' }}>
                Reporte PV Vinculadas
              </div>
              <div className="p-3 flex flex-wrap gap-1">
                {['HISTORIAL','EMPRESA','PV/SOLICITUD','FECHA','TIPO','NOMBRE',
                  'CELULAR PERSONAL','TELEFONO PERSONAL','DNI','VENDEDOR','UNIDAD'].map(c => (
                  <span key={c} className={'badge text-xs ' + (['PV/SOLICITUD','FECHA','DNI','CELULAR PERSONAL'].includes(c) ? 'badge-green' : 'badge-gray')}
                    style={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>{c}</span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: '#2a2a2a' }}>
              <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase" style={{ background: '#0a0a0a' }}>
                Reporte Derivado
              </div>
              <div className="p-3 flex flex-wrap gap-1">
                {['Nro Tramite','Fecha de Consulta','Cliente','DNI','Telefono','Celular',
                  'Vendedor','Unidad','Sub Tipo de Seguimiento','Estado Tramite'].map(c => (
                  <span key={c} className={'badge text-xs ' + (['Nro Tramite','DNI','Telefono','Celular'].includes(c) ? 'badge-green' : 'badge-gray')}
                    style={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>{c}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Dos zonas de carga */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <DropZone
            label="Reporte PV Vinculadas"
            sublabel="Reporte_PV_Vinculadas.xls"
            badge="badge-green"
            file={filePV}
            onFile={setFilePV}
            onClear={() => setFilePV(null)}
          />
          <DropZone
            label="Reporte Derivado"
            sublabel="Reporte_Derviado.xls"
            badge="badge-blue"
            file={fileDer}
            onFile={setFileDer}
            onClear={() => setFileDer(null)}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={procesar} disabled={uploading || (!filePV && !fileDer)} className="btn-primary">
            {uploading ? 'Procesando...' : 'Procesar'}
          </button>
          {result && !result.error && (
            <span className="text-xs text-gray-400">
              <span style={{ color: BRAND }}>{result.guardados}</span> registros guardados de {result.procesados} leídos
            </span>
          )}
          {result?.error && (
            <span className="text-xs text-red-400 max-w-md">{result.error}</span>
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
          <input className="input-dark w-48" placeholder="Nombre, DNI, PV..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <select className="input-dark w-40" value={filters.fuente} onChange={e => sf('fuente', e.target.value)}>
            <option value="">Sistema: todos</option>
            <option value="pv_vinculadas">PV Vinculadas</option>
            <option value="derivado">Derivado</option>
          </select>
          <input className="input-dark w-32" placeholder="Tipo..."
            value={filters.tipo} onChange={e => sf('tipo', e.target.value)} />
          <input className="input-dark w-36" placeholder="Marca/empresa..."
            value={filters.marca} onChange={e => sf('marca', e.target.value)} />
          <button onClick={() => { setFilters({ search:'', tipo:'', marca:'', fuente:'' }); setPage(0) }}
            className="text-xs text-gray-600 hover:text-gray-300">Limpiar</button>
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>PV/Solicitud</th>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Cliente</th>
              <th>DNI</th>
              <th>Teléfono</th>
              <th>Vendedor</th>
              <th>Marca</th>
              <th>Sistema</th>
              <th>Lead</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && ventas.length === 0 && (
                <tr><td colSpan={10} className="text-center py-8 text-gray-600">
                  Sin registros. Subí los archivos arriba.
                </td></tr>
              )}
              {ventas.map(v => (
                <tr key={v.id}>
                  <td className="font-mono text-xs" style={{ color: BRAND }}>
                    {v.pv_solicitud?.replace('DER-', '') || '—'}
                  </td>
                  <td className="text-gray-500 text-xs whitespace-nowrap">
                    {v.fecha ? v.fecha.slice(0,10).split('-').reverse().join('/') : '—'}
                  </td>
                  <td>
                    {v.tipo ? <span className="badge badge-blue">{v.tipo}</span> : '—'}
                  </td>
                  <td className="font-medium text-white">{v.nombre || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{v.dni || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">
                    {v.telefono_personal || v.celular_personal || '—'}
                  </td>
                  <td className="text-gray-400">{v.vendedor || '—'}</td>
                  <td className="text-gray-400 text-xs">{v.marca || '—'}</td>
                  <td>
                    <span className={'badge ' + (v.fuente === 'pv_vinculadas' ? 'badge-green' : 'badge-blue')}>
                      {v.fuente === 'pv_vinculadas' ? 'PV' : 'Derivado'}
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
