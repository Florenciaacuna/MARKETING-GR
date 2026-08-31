import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  parseFile, detectFileType,
  normalizeFacilitadoresRow, normalizeDerivadoRow,
  normalizeK1Row, normalizePVRow
} from '../lib/parsers'
import { matchLeadsToSales } from '../lib/matching'

const FILE_TYPES = [
  { id: 'facilitadores',      label: 'Reporte Facilitadores',   fuente: 'Celer',      color: 'bg-blue-100 border-blue-300'   },
  { id: 'derivado_celer',     label: 'Reporte Derivado',        fuente: 'Celer',      color: 'bg-blue-100 border-blue-300'   },
  { id: 'derivado_autodealer',label: 'Reporte Derivado',        fuente: 'Autodealer', color: 'bg-purple-100 border-purple-300'},
  { id: 'pv_autodealer',      label: 'PV Vinculadas',           fuente: 'Autodealer', color: 'bg-purple-100 border-purple-300'},
  { id: 'k1',                 label: 'Ventas K1',               fuente: 'K1',         color: 'bg-green-100 border-green-300'  },
]

function DropZone({ type, file, onFile }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(type.id, f)
  }, [type.id, onFile])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current.click()}
      className={`border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all
        ${dragging ? 'border-[#8BC34A] bg-green-50 scale-[1.02]' : type.color}
        ${file ? 'border-solid border-[#8BC34A]' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.xlsx,.csv"
        className="hidden"
        onChange={e => { if (e.target.files[0]) onFile(type.id, e.target.files[0]) }}
      />
      <div className="text-center">
        <div className="text-2xl mb-1">{file ? '✅' : '📂'}</div>
        <div className="font-semibold text-sm text-gray-700">{type.label}</div>
        <div className="text-xs text-gray-500">{type.fuente}</div>
        {file
          ? <div className="mt-1 text-xs text-green-700 font-medium truncate">{file.name}</div>
          : <div className="mt-1 text-xs text-gray-400">Clic o arrastrar archivo</div>
        }
      </div>
    </div>
  )
}

function ResultBadge({ label, value, color }) {
  return (
    <div className={`rounded-lg p-3 text-center ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-600 mt-1">{label}</div>
    </div>
  )
}

export default function Carga() {
  const [files, setFiles]     = useState({})
  const [status, setStatus]   = useState('idle') // idle | processing | done | error
  const [results, setResults] = useState(null)
  const [log, setLog]         = useState([])

  const addLog = (msg, type = 'info') => {
    setLog(prev => [...prev, { msg, type, ts: new Date().toLocaleTimeString('es-AR') }])
  }

  const handleFile = useCallback((typeId, file) => {
    setFiles(prev => ({ ...prev, [typeId]: file }))
    setStatus('idle')
    setResults(null)
  }, [])

  async function procesar() {
    if (Object.keys(files).length === 0) {
      alert('Seleccioná al menos un archivo para procesar.')
      return
    }

    setStatus('processing')
    setLog([])
    const allLeads  = []
    const allVentas = []

    // ── 1. PARSEAR ARCHIVOS ─────────────────────────────
    for (const [typeId, file] of Object.entries(files)) {
      addLog(`Leyendo: ${file.name}`)
      try {
        const { data, format } = await parseFile(file)
        addLog(`  → ${data.length} registros (formato ${format})`)

        if (typeId === 'facilitadores') {
          allLeads.push(...data.map(normalizeFacilitadoresRow))
        } else if (typeId === 'derivado_celer') {
          allLeads.push(...data.map(r => normalizeDerivadoRow(r, 'celer')))
        } else if (typeId === 'derivado_autodealer') {
          allLeads.push(...data.map(r => normalizeDerivadoRow(r, 'autodealer')))
        } else if (typeId === 'pv_autodealer') {
          allVentas.push(...data.map(normalizePVRow))
        } else if (typeId === 'k1') {
          allVentas.push(...data.map(normalizeK1Row))
        }
      } catch (e) {
        addLog(`  ✗ Error en ${file.name}: ${e.message}`, 'error')
      }
    }

    addLog(`Total leads: ${allLeads.length} | Total ventas: ${allVentas.length}`)

    // ── 2. CARGAR CAMPAÑAS PARA ATRIBUCIÓN ─────────────
    const { data: campanas } = await supabase.from('mkt_campanas').select('id, codigo, nombre')
    addLog(`Campañas registradas: ${campanas?.length || 0}`)

    // ── 3. CRUCE DNI / TELÉFONO ────────────────────────
    addLog('Ejecutando cruce DNI/teléfono...')
    const { matched, stats } = matchLeadsToSales(allLeads, allVentas, campanas || [])
    addLog(`  → ${stats.ventas_atribuidas} ventas atribuidas a leads (${stats.tasa_atribucion}%)`)
    addLog(`     Por DNI: ${stats.por_metodo.dni} | Teléfono: ${stats.por_metodo.telefono} | Celular: ${stats.por_metodo.celular}`)

    // ── 4. GUARDAR LEADS EN SUPABASE ───────────────────
    let leadsNuevos = 0
    if (allLeads.length > 0) {
      addLog('Guardando leads...')
      const { error, count } = await supabase
        .from('mkt_leads')
        .upsert(
          allLeads.filter(l => l.nro_tramite),
          { onConflict: 'nro_tramite,fuente', ignoreDuplicates: false, count: 'estimated' }
        )
      if (error) addLog(`  ✗ Error leads: ${error.message}`, 'error')
      else { leadsNuevos = allLeads.length; addLog(`  → ${allLeads.length} leads guardados`) }
    }

    // ── 5. GUARDAR VENTAS CON ATRIBUCIÓN ──────────────
    let ventasNuevas = 0
    if (allVentas.length > 0) {
      addLog('Guardando ventas...')
      const ventasConAtribucion = allVentas.map(v => {
        const match = matched.find(m => m.venta === v)
        return {
          ...v,
          lead_id:      match?.lead?.id || null,
          campana_id:   match?.campana_id || null,
          metodo_match: match?.metodo || null,
        }
      })
      const { error } = await supabase
        .from('mkt_ventas')
        .upsert(
          ventasConAtribucion.filter(v => v.pv_solicitud),
          { onConflict: 'pv_solicitud,fuente', ignoreDuplicates: false }
        )
      if (error) addLog(`  ✗ Error ventas: ${error.message}`, 'error')
      else { ventasNuevas = allVentas.length; addLog(`  → ${allVentas.length} ventas guardadas`) }
    }

    // ── 6. LOG DE CARGA ────────────────────────────────
    await supabase.from('mkt_upload_log').insert({
      tipo_archivo:          Object.keys(files).join(', '),
      nombre_archivo:        Object.values(files).map(f => f.name).join(', '),
      registros_procesados:  allLeads.length + allVentas.length,
      registros_nuevos:      leadsNuevos + ventasNuevas,
    })

    addLog('✅ Procesamiento completo.')
    setStatus('done')
    setResults({ ...stats, leadsNuevos, ventasNuevas })
  }

  function resetear() {
    setFiles({})
    setStatus('idle')
    setResults(null)
    setLog([])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Carga de archivos</h1>
        <p className="text-gray-500 text-sm mt-1">
          Descargá los reportes de Celer, Autodealer y K1, y subílos acá. El sistema hace el cruce solo.
        </p>
      </div>

      {/* DROP ZONES */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {FILE_TYPES.map(type => (
          <DropZone key={type.id} type={type} file={files[type.id]} onFile={handleFile} />
        ))}
      </div>

      {/* ACTIONS */}
      <div className="flex gap-3">
        <button
          onClick={procesar}
          disabled={status === 'processing' || Object.keys(files).length === 0}
          className="px-6 py-2.5 bg-[#8BC34A] text-white font-semibold rounded-lg
            hover:bg-[#7CB342] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'processing' ? '⏳ Procesando...' : '▶ Procesar archivos'}
        </button>
        {status !== 'idle' && (
          <button
            onClick={resetear}
            className="px-6 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ↺ Nueva carga
          </button>
        )}
      </div>

      {/* RESULTS */}
      {results && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-800 mb-4">Resultado del procesamiento</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <ResultBadge label="Leads cargados"      value={results.leadsNuevos}      color="bg-blue-50"  />
            <ResultBadge label="Ventas cargadas"     value={results.ventasNuevas}     color="bg-green-50" />
            <ResultBadge label="Ventas atribuidas"   value={results.ventas_atribuidas} color="bg-yellow-50"/>
            <ResultBadge label="Tasa de atribución"  value={`${results.tasa_atribucion}%`} color="bg-purple-50"/>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-50 rounded p-3 text-center">
              <div className="font-bold">{results.por_metodo.dni}</div>
              <div className="text-gray-500">Match por DNI</div>
            </div>
            <div className="bg-gray-50 rounded p-3 text-center">
              <div className="font-bold">{results.por_metodo.telefono}</div>
              <div className="text-gray-500">Match por teléfono</div>
            </div>
            <div className="bg-gray-50 rounded p-3 text-center">
              <div className="font-bold">{results.ventas_sin_lead}</div>
              <div className="text-gray-500">Ventas sin lead</div>
            </div>
          </div>
        </div>
      )}

      {/* LOG */}
      {log.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs text-gray-300 max-h-64 overflow-y-auto">
          {log.map((entry, i) => (
            <div key={i} className={`leading-relaxed ${entry.type === 'error' ? 'text-red-400' : ''}`}>
              <span className="text-gray-500">[{entry.ts}]</span> {entry.msg}
            </div>
          ))}
        </div>
      )}

      {/* LAST UPLOADS */}
      <LastUploads />
    </div>
  )
}

function LastUploads() {
  const [logs, setLogs] = useState([])
  const [loaded, setLoaded] = useState(false)

  if (!loaded) {
    supabase
      .from('mkt_upload_log')
      .select('*')
      .order('fecha_upload', { ascending: false })
      .limit(5)
      .then(({ data }) => { setLogs(data || []); setLoaded(true) })
  }

  if (!loaded || logs.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-700 mb-3 text-sm">Últimas cargas</h3>
      <table className="w-full text-xs text-gray-600">
        <thead>
          <tr className="border-b">
            <th className="text-left pb-2">Fecha</th>
            <th className="text-right pb-2">Procesados</th>
            <th className="text-right pb-2">Nuevos</th>
            <th className="text-left pb-2 pl-4">Archivos</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-1.5">{new Date(l.fecha_upload).toLocaleString('es-AR')}</td>
              <td className="text-right">{l.registros_procesados}</td>
              <td className="text-right">{l.registros_nuevos}</td>
              <td className="pl-4 text-gray-400 truncate max-w-xs">{l.nombre_archivo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
