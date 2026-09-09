import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizeEntregaRow } from '../lib/parsers'

const BRAND = '#B5E000'
const PAGE  = 50

export default function Entregas() {
  const [entregas, setEntregas] = useState([])
  const [total,    setTotal]    = useState(0)
  const [stats,    setStats]    = useState(null)
  const [page,     setPage]     = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [filters,  setFilters]  = useState({ search: '', salon: '', sistema: '' })
  const [file,     setFile]     = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading,setUploading]= useState(false)
  const [result,   setResult]   = useState(null)
  const fileRef = useRef()

  const loadStats = useCallback(async () => {
    const [{ count: totalE }, { count: conVenta }] = await Promise.all([
      supabase.from('mkt_entregas').select('*', { count: 'exact', head: true }),
      supabase.from('mkt_entregas').select('*', { count: 'exact', head: true }).not('venta_id', 'is', null),
    ])
    setStats({ total: totalE || 0, conVenta: conVenta || 0 })
  }, [])

  const loadEntregas = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('mkt_entregas')
      .select('id,fecha_entrega,sistema,tipo_preventa,vendedor,salon,preventa,venta_id', { count: 'exact' })
      .order('fecha_entrega', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (filters.salon)   q = q.ilike('salon',   '%' + filters.salon   + '%')
    if (filters.sistema) q = q.ilike('sistema', '%' + filters.sistema + '%')
    if (filters.search)  q = q.ilike('preventa','%' + filters.search  + '%')
    const { data, count, error } = await q
    if (error) console.error('Error cargando entregas:', error)
    setEntregas(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [page, filters])

  useEffect(() => { loadStats(); loadEntregas() }, [loadStats, loadEntregas])

  async function procesar() {
    if (!file) return
    setUploading(true); setResult(null)

    const { data: rows, format } = await parseFile(file)
    if (!rows || rows.length === 0) {
      setResult({ procesados: 0, guardados: 0, error: 'No se pudieron leer datos del archivo. Formato: ' + format })
      setUploading(false); return
    }

    const mapeados = rows.map(normalizeEntregaRow).filter(Boolean)
    const visto = new Map()
    mapeados.forEach(e => { if (e.preventa) visto.set(e.preventa, e) })
    const validos = Array.from(visto.values())

    // Vincular PV/US con mkt_ventas
    const pvUs = validos.filter(e => e.preventa?.startsWith('PV ') || e.preventa?.startsWith('US '))
    let ventaMap = {}
    if (pvUs.length > 0) {
      const { data: ventas } = await supabase.from('mkt_ventas')
        .select('id,pv_solicitud')
        .in('pv_solicitud', pvUs.map(e => e.preventa))
      if (ventas) ventas.forEach(v => { ventaMap[v.pv_solicitud] = v.id })
    }

    const paraGuardar = validos.map(e => ({
      ...e,
      venta_id: ventaMap[e.preventa] || null
    }))

    let guardados = 0; let errorMsg = null; let conVinculo = 0; let sinVinculo = 0

    for (let i = 0; i < paraGuardar.length; i += 200) {
      const batch = paraGuardar.slice(i, i + 200)
      const { error } = await supabase.from('mkt_entregas')
        .upsert(batch, { onConflict: 'preventa', ignoreDuplicates: false })
      if (error) { errorMsg = error.message; console.error('Upsert error:', error) }
      else {
        guardados += batch.length
        conVinculo += batch.filter(e => e.venta_id).length
        sinVinculo += batch.filter(e => !e.venta_id).length
      }
    }

    setResult({
      procesados: rows.length,
      excluidas: rows.length - validos.length,
      guardados, conVinculo, sinVinculo, error: errorMsg
    })
    setUploading(false); setFile(null)
    if (guardados > 0) { loadEntregas(); loadStats() }
  }

  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }
  const pctVinculada = stats?.total > 0 ? Math.round(stats.conVenta / stats.total * 100) : 0

  return (
    <div className="space-y-5">

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-4 border" style={{ background: '#111', borderColor: '#2a2a2a' }}>
            <div className="text-2xl font-black text-white">{stats.total.toLocaleString('es-AR')}</div>
            <div className="text-xs text-gray-500 mt-1 uppercase font-bold">Total entregas</div>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#1a2e00', borderColor: BRAND }}>
            <div className="text-2xl font-black" style={{ color: BRAND }}>{stats.conVenta.toLocaleString('es-AR')}</div>
            <div className="text-xs mt-1 uppercase font-bold" style={{ color: BRAND }}>
              Vinculadas a PV — {pctVinculada}%
            </div>
            <div className="text-xs text-gray-600 mt-0.5">Cadena completa: lead → venta → entrega</div>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#111', borderColor: '#2a2a2a' }}>
            <div className="text-2xl font-black text-white">{(stats.total - stats.conVenta).toLocaleString('es-AR')}</div>
            <div className="text-xs text-gray-500 mt-1 uppercase font-bold">Sin vínculo</div>
            <div className="text-xs text-gray-600 mt-0.5">GR o PV no cargada</div>
          </div>
        </div>
      )}

      {/* CARGA */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-white text-base">Reporte Historial de Entregas</h2>
            <p className="text-xs text-gray-500 mt-0.5">Descargado del K1 · Se excluyen automáticamente las Ventas Especiales</p>
          </div>
        </div>

        <div className="info-box">
          <span className="info-icon">ℹ</span>
          <div>
            <strong>¿Cómo funciona?</strong> El sistema lee la columna <strong>PREVENTA</strong> y la vincula
            con las ventas en PV Vinculadas. Los PV/US se enlazan automáticamente.
            Los GR (Plan de Ahorro) se guardan sin vínculo. Las <strong>Ventas Especiales</strong> se descartan.
          </div>
        </div>

        <div
          className={'dropzone ' + (dragging ? 'active' : '') + (file ? ' filled' : '')}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if(f) { setFile(f); setResult(null) } }}
          onClick={() => fileRef.current.click()}
        >
          <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" className="hidden"
            onChange={e => { if(e.target.files[0]) { setFile(e.target.files[0]); setResult(null) } }} />
          <div className="text-2xl mb-1">{file ? '✓' : '↑'}</div>
          <div className="font-semibold text-sm text-white">
            {file ? file.name : 'Reporte_historial_entregas.xlsx'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {file ? 'Listo para procesar' : 'Clic o arrastrar el archivo del K1'}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button onClick={procesar} disabled={uploading || !file} className="btn-primary">
            {uploading ? 'Procesando...' : 'Procesar'}
          </button>
          {file && !uploading && (
            <button onClick={() => { setFile(null); setResult(null) }} className="btn-ghost text-xs">Quitar</button>
          )}
        </div>

        {result && (
          <div className="mt-3 p-3 rounded-lg border text-xs space-y-1" style={{ background: '#111', borderColor: '#2a2a2a' }}>
            {result.guardados > 0
              ? <div><span style={{ color: BRAND }} className="font-bold">{result.guardados}</span> <span className="text-gray-400">entregas guardadas de {result.procesados} leídas</span></div>
              : <div className="text-yellow-400 font-bold">⚠ 0 guardadas de {result.procesados} leídas</div>}
            {result.error && <div className="text-red-400 break-all">{result.error}</div>}
            <div className="text-gray-500">
              Venta especial excluida: <span className="text-gray-300">{result.excluidas}</span> ·
              Vinculadas a PV: <span style={{ color: BRAND }}>{result.conVinculo}</span> ·
              Sin vínculo: <span className="text-gray-300">{result.sinVinculo}</span>
            </div>
          </div>
        )}
      </div>

      {/* TABLA */}
      <div className="card">
        <div className="section-header">
          <h2>Entregas cargadas</h2>
          <span className="count-badge">{total.toLocaleString('es-AR')} registros</span>
        </div>

        <div className="filter-bar">
          <input className="input-dark" style={{ width: 180 }} placeholder="Buscar PV..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <div className="filter-sep"/>
          <select className="input-dark" style={{ width: 140 }} value={filters.sistema} onChange={e => sf('sistema', e.target.value)}>
            <option value="">Sistema: todos</option>
            <option>Ciara</option><option>Kiara</option><option>Movilis</option>
            <option>Peara</option><option>LaFabricaUS</option><option>Salra</option>
          </select>
          <select className="input-dark" style={{ width: 160 }} value={filters.salon} onChange={e => sf('salon', e.target.value)}>
            <option value="">Salón: todos</option>
            <option>BERAZATEGUI</option><option>BERISSO</option>
            <option>CAPITAL DEL USADO</option><option>CENTENARIO</option>
            <option>CIARA 44</option><option>FABRICA</option>
            <option>KIARA 44</option><option>MOVILIS</option>
            <option>PEARA 44</option><option>RANDAZZO</option>
          </select>
          <div className="filter-sep"/>
          <button onClick={() => { setFilters({ search: '', salon: '', sistema: '' }); setPage(0) }}
            className="btn-ghost text-xs flex-shrink-0">Limpiar</button>
        </div>

        <div className="filter-results">
          Mostrando <span>{entregas.length}</span> de <span>{total.toLocaleString('es-AR')}</span> entregas
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: '#2a2a2a' }}>
          <table className="dark-table">
            <thead><tr>
              <th>Preventa</th><th>Fecha entrega</th><th>Sistema</th>
              <th>Tipo</th><th>Vendedor</th><th>Salón</th><th>PV vinculada</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && entregas.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-600">
                  Sin entregas. Subí el reporte arriba.
                </td></tr>
              )}
              {entregas.map(e => (
                <tr key={e.id}>
                  <td className="font-mono text-xs" style={{ color: BRAND }}>{e.preventa || '—'}</td>
                  <td className="text-gray-500 text-xs whitespace-nowrap">
                    {e.fecha_entrega ? String(e.fecha_entrega).slice(0, 10).split('-').reverse().join('/') : '—'}
                  </td>
                  <td><span className="badge badge-gray">{e.sistema || '—'}</span></td>
                  <td className="text-xs text-gray-400">{e.tipo_preventa || '—'}</td>
                  <td className="text-gray-400 text-xs">{e.vendedor || '—'}</td>
                  <td className="text-xs text-gray-400">{e.salon || '—'}</td>
                  <td>
                    {e.venta_id
                      ? <span className="badge badge-green">Sí</span>
                      : <span className="badge badge-gray">No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-600">Página {page + 1}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-ghost text-xs">← Anterior</button>
            <button onClick={() => setPage(p => p + 1)} disabled={entregas.length < PAGE} className="btn-ghost text-xs">Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
