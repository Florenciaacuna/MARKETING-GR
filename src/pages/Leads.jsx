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
        onClick={() => ref.current.click()}>
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
  const [filters,      setFilters]      = useState({ search:'', canal:'', fuente:'', campana:'' })
  const [fileFac,      setFileFac]      = useState(null)
  const [fileDer,      setFileDer]      = useState(null)
  const [uploading,    setUploading]    = useState(false)
  const [result,       setResult]       = useState(null)
  const [showFmt,      setShowFmt]      = useState(false)
  const [enriching,    setEnriching]    = useState(false)
  const [enrichResult, setEnrichResult] = useState(null)
  const [campanas,     setCampanas]     = useState([])
  const [showManual,   setShowManual]   = useState(false)
  const [manualTab,    setManualTab]    = useState('form')
  const [manualForm,   setManualForm]   = useState({ nombre:'', apellido:'', telefono:'', email:'', campana_id:'' })
  const [manualSaving, setManualSaving] = useState(false)
  const [manualMsg,    setManualMsg]    = useState('')
  const [excelFile,    setExcelFile]    = useState(null)
  const [excelPreview, setExcelPreview] = useState([])
  const [excelLoading, setExcelLoading] = useState(false)
  const excelRef = useRef()

  const mf = (k, v) => setManualForm(p => ({ ...p, [k]: v }))
  const sf = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(0) }

  const loadLeads = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('mkt_leads')
      .select('id,nro_tramite,fecha_consulta,apellido,nombre,dni,telefono,email,origen,canal,codigo_campana,vendedor,fuente,campana_id,estado', { count:'exact' })
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

  useEffect(() => {
    supabase.from('mkt_campanas').select('id,codigo,nombre,marca,rubro')
      .eq('activo', true).order('nombre')
      .then(({ data }) => setCampanas(data || []))
  }, [])

  async function procesar() {
    if (!fileFac && !fileDer) return
    setUploading(true); setResult(null)
    let guardadosFac = 0, guardadosDer = 0, errorMsg = null
    let diagFac = null, diagDer = null

    if (fileFac) {
      const raw1 = await parseFile(fileFac)
      const rows = Array.isArray(raw1) ? raw1 : (raw1.data || [])
      const mapeados = rows.map(normalizeFacilitadoresRow)
      const visto = new Map()
      mapeados.filter(l => l.nro_tramite)
        .map(l => ({ ...l, nro_tramite: String(l.nro_tramite) }))
        .forEach(l => visto.set(l.nro_tramite + '|' + l.fuente, l))
      const dedup = Array.from(visto.values())
      diagFac = { leidos: rows.length, conNro: dedup.length, conDNI: mapeados.filter(l=>l.dni).length, conTel: mapeados.filter(l=>l.telefono).length }
      for (let i = 0; i < dedup.length; i += 500) {
        const { error } = await supabase.from('mkt_leads')
          .upsert(dedup.slice(i, i+500), { onConflict:'nro_tramite,fuente', ignoreDuplicates:false })
        if (error) { errorMsg = 'Facilitadores: ' + error.message; break }
        else guardadosFac += Math.min(500, dedup.length - i)
      }
    }

    if (fileDer) {
      const raw2 = await parseFile(fileDer)
      const rows = Array.isArray(raw2) ? raw2 : (raw2.data || [])
      const mapeados = rows.map(normalizeDerivadoLeadRow)
      const visto = new Map()
      mapeados.filter(l => l.nro_tramite).forEach(l => visto.set(l.nro_tramite + '|' + l.fuente, l))
      const dedup = Array.from(visto.values())
      diagDer = { leidos: rows.length, conNro: dedup.length, conDNI: mapeados.filter(l=>l.dni).length, conTel: mapeados.filter(l=>l.telefono||l.celular).length }
      for (let i = 0; i < dedup.length; i += 500) {
        const { error } = await supabase.from('mkt_leads')
          .upsert(dedup.slice(i, i+500), { onConflict:'nro_tramite,fuente', ignoreDuplicates:false })
        if (error) { errorMsg = (errorMsg||'') + ' Derivado: ' + error.message; break }
        else guardadosDer += Math.min(500, dedup.length - i)
      }
    }

    setResult({ guardadosFac, guardadosDer, error: errorMsg, diagFac, diagDer })
    setUploading(false); setFileFac(null); setFileDer(null)
    if (guardadosFac + guardadosDer > 0) loadLeads()
  }

  async function enriquecerConIA() {
    setEnriching(true); setEnrichResult(null)
    try {
      const { count } = await supabase.from('mkt_leads')
        .select('*', { count:'exact', head:true })
        .not('consulta','is',null).is('dni',null).is('telefono',null)
      if (!count) { setEnrichResult('Todos los leads ya tienen DNI o teléfono.'); setEnriching(false); return }
      const resp = await fetch('https://finanzasgr.app.n8n.cloud/webhook/enriquecer-leads-ia', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ triggered:true })
      })
      setEnrichResult(resp.ok
        ? `Procesando ${count.toLocaleString('es-AR')} leads con IA. Tarda 30-45 min.`
        : 'Error al iniciar el proceso.')
    } catch(e) { setEnrichResult('Error de conexión: ' + e.message) }
    setEnriching(false)
  }

  async function guardarLeadManual() {
    if (!manualForm.campana_id) { setManualMsg('La campaña es obligatoria.'); return }
    if (!manualForm.nombre && !manualForm.apellido) { setManualMsg('Ingresá al menos nombre o apellido.'); return }
    setManualSaving(true); setManualMsg('')
    const camp  = campanas.find(c => c.id === manualForm.campana_id)
    const today = new Date().toISOString().slice(0,10)
    const { error } = await supabase.from('mkt_leads').insert({
      nombre: manualForm.nombre.trim() || null,
      apellido: manualForm.apellido.trim() || null,
      telefono: manualForm.telefono.trim() || null,
      celular:  manualForm.telefono.trim() || null,
      email:    manualForm.email.trim()    || null,
      campana_id:     manualForm.campana_id,
      codigo_campana: camp ? camp.codigo : null,
      fuente: 'manual', origen: 'Evento', fecha_consulta: today, estado: 'nuevo'
    })
    if (error) { setManualMsg('Error: ' + error.message) }
    else {
      setManualMsg('✓ Lead cargado')
      setManualForm(p => ({ ...p, nombre:'', apellido:'', telefono:'', email:'' }))
      loadLeads()
    }
    setManualSaving(false)
  }

  async function cargarExcelAsistentes(f) {
    setExcelFile(f); setExcelLoading(true); setManualMsg('')
    try {
      const result = await parseFile(f)
      const rows = Array.isArray(result) ? result : (result.data || result || [])
      const get = (row, ...keys) => {
        for (const k of keys) {
          const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[^a-z]/g,'').includes(k))
          if (found && row[found] !== null && row[found] !== undefined) {
            const val = String(row[found]).trim()
            if (val && val !== '0') return val
          }
        }
        return ''
      }
      const preview = rows.slice(0,500).map(row => {
        // Detectar campo "Nombre y Apellido" combinado
        const nombreCompleto = get(row,'nombreyapellido','nombrey','fullname')
        const nombre   = nombreCompleto || get(row,'nombre','name','first')
        const apellido = nombreCompleto ? '' : get(row,'apellido','lastname','surname')
        const telefono = get(row,'celular','telefono','phone','cel','tel','movil','whatsapp')
        const email    = get(row,'correo','email','mail','emailaddress')
        const dni      = get(row,'dni','cedula','documento','id')
        return { nombre, apellido, telefono, email, dni }
      }).filter(r => r.nombre || r.apellido || r.telefono || r.email)
      setExcelPreview(preview)
    } catch(e) { setManualMsg('Error al leer el Excel: ' + e.message) }
    setExcelLoading(false)
  }

  async function guardarExcelAsistentes() {
    if (!manualForm.campana_id) { setManualMsg('Seleccioná la campaña primero.'); return }
    if (!excelPreview.length)   { setManualMsg('No hay datos para cargar.'); return }
    setManualSaving(true); setManualMsg('')
    const camp  = campanas.find(c => c.id === manualForm.campana_id)
    const today = new Date().toISOString().slice(0,10)
    const rows  = excelPreview.map(r => ({
      nombre: r.nombre || null, apellido: r.apellido || null,
      telefono: r.telefono || null, celular: r.telefono || null, email: r.email || null,
      campana_id: manualForm.campana_id, codigo_campana: camp ? camp.codigo : null,
      fuente: 'manual', origen: 'Evento', fecha_consulta: today, estado: 'nuevo'
    }))
    let ok = 0, err = 0
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from('mkt_leads').insert(rows.slice(i, i+100))
      if (error) err += Math.min(100, rows.length-i); else ok += Math.min(100, rows.length-i)
    }
    setManualMsg(ok > 0 ? `✓ ${ok} leads cargados${err > 0 ? ` (${err} errores)` : ''}` : 'Error al cargar')
    setExcelFile(null); setExcelPreview([])
    if (ok > 0) loadLeads()
    setManualSaving(false)
  }

  return (
    <div className="space-y-5">

      {/* CARGA DESDE CELER */}
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
            {[
              { title:'Facilitadores', cols:['Fecha de consulta','ID','JOB_SEQ','Apellido','Nombre','DNI','TELNUMERO','TELCODAREA','Email','Consulta','USUARIO_DERIVO','campania'], key:['ID','JOB_SEQ','DNI','TELNUMERO'] },
              { title:'Derivado', cols:['Nro Tramite','Fecha de Consulta','Cliente','DNI','Telefono','Celular','Email','Vendedor','Origen','Sub Origen','Campaña','Estado Tramite'], key:['Nro Tramite','DNI','Telefono','Celular'] }
            ].map(({ title, cols, key }) => (
              <div key={title} className="rounded-lg border overflow-hidden" style={{ borderColor:'#2a2a2a' }}>
                <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase" style={{ background:'#0a0a0a' }}>{title}</div>
                <div className="p-2 flex flex-wrap gap-1">
                  {cols.map(c => (
                    <span key={c} className={'badge ' + (key.includes(c) ? 'badge-green' : 'badge-gray')}
                      style={{ fontFamily:'monospace', fontSize:'0.6rem' }}>{c}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <DropZone label="Reporte Leads por Facilitadores" sublabel="Reporte_Leads_por_Facilitadores.xls"
            badge="badge-green" note="fuente: celer" file={fileFac}
            onFile={f => { setFileFac(f); setResult(null) }} onClear={() => setFileFac(null)} />
          <DropZone label="Reporte Derivado" sublabel="Reporte_Derivado.xls"
            badge="badge-blue" note="fuente: derivado" file={fileDer}
            onFile={f => { setFileDer(f); setResult(null) }} onClear={() => setFileDer(null)} />
        </div>

        <button onClick={procesar} disabled={uploading || (!fileFac && !fileDer)} className="btn-primary">
          {uploading ? 'Procesando...' : 'Procesar'}
        </button>

        {result && (
          <div className="mt-3 p-3 rounded-lg border text-xs space-y-1.5" style={{ background:'#111', borderColor:'#2a2a2a' }}>
            {result.diagFac && (
              <div>
                <span className="font-bold" style={{ color: BRAND }}>Facilitadores: </span>
                <span className="text-gray-400">{result.guardadosFac} guardados de {result.diagFac.leidos} leídos</span>
                <span className="text-gray-600 ml-2">· DNI: {result.diagFac.conDNI} · Tel: {result.diagFac.conTel}</span>
              </div>
            )}
            {result.diagDer && (
              <div>
                <span className="font-bold" style={{ color:'#60a5fa' }}>Derivado: </span>
                <span className="text-gray-400">{result.guardadosDer} guardados de {result.diagDer.leidos} leídos</span>
                <span className="text-gray-600 ml-2">· DNI: {result.diagDer.conDNI} · Tel: {result.diagDer.conTel}</span>
              </div>
            )}
            {result.error && <div className="text-red-400">{result.error}</div>}
          </div>
        )}

        <div className="mt-4 pt-4 border-t" style={{ borderColor:'#2a2a2a' }}>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-xs font-bold text-white mb-0.5">Enriquecer leads con IA</div>
              <div className="text-xs text-gray-500">Claude lee la columna CONSULTA y extrae DNI, teléfono y email faltantes.</div>
              {enrichResult && <div className="mt-1 text-xs" style={{ color: BRAND }}>{enrichResult}</div>}
            </div>
            <button onClick={enriquecerConIA} disabled={enriching} className="btn-primary text-xs whitespace-nowrap flex-shrink-0">
              {enriching ? 'Procesando con IA...' : '✦ Enriquecer con IA'}
            </button>
          </div>
        </div>
      </div>

      {/* CARGA MANUAL */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND }}>
              Carga manual de leads
            </div>
            <div className="text-xs mt-0.5" style={{ color:'#4b5563' }}>
              Para asistentes a eventos u otros canales no digitales
            </div>
          </div>
          <button
            onClick={() => { setShowManual(p => !p); setManualMsg(''); setExcelFile(null); setExcelPreview([]) }}
            className="btn-ghost text-xs">
            {showManual ? '✕ Cerrar' : '+ Agregar lead'}
          </button>
        </div>

        {showManual && (
          <div className="mt-4" style={{ background:'#0f0f0f', border:'1px solid #2a2a2a', borderRadius:10, padding:16 }}>

            {/* Tabs: uno por uno vs Excel */}
            <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background:'#1a1a1a', width:'fit-content' }}>
              {[['form','✏ Uno por uno'],['excel','📋 Cargar Excel']].map(([id, label]) => (
                <button key={id} onClick={() => { setManualTab(id); setManualMsg('') }}
                  className="text-xs px-3 py-1.5 rounded-md font-medium transition-all"
                  style={{ background: manualTab === id ? BRAND : 'none', color: manualTab === id ? '#000' : '#6b7280' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Campaña — visible en ambos tabs */}
            <div className="mb-4">
              <div className="text-xs mb-1.5 font-bold" style={{ color: BRAND }}>
                Campaña / Evento <span style={{ color:'#ef4444' }}>*</span>
                <span className="font-normal ml-1" style={{ color:'#4b5563' }}>(obligatorio para ambos modos)</span>
              </div>
              <select className="input-dark"
                style={{ width:'100%', maxWidth:520, borderColor: !manualForm.campana_id ? '#5a1e00' : '#2a2a2a' }}
                value={manualForm.campana_id} onChange={e => mf('campana_id', e.target.value)}>
                <option value="">— Seleccionar campaña o evento</option>
                {campanas.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre} — {c.marca} ({c.rubro})</option>
                ))}
              </select>
            </div>

            {/* TAB: Formulario individual */}
            {manualTab === 'form' && (
              <div>
                <div className="grid gap-3" style={{ gridTemplateColumns:'1fr 1fr 1fr 1fr' }}>
                  {[
                    { k:'nombre',   label:'Nombre',  ph:'Nombre' },
                    { k:'apellido', label:'Apellido', ph:'Apellido' },
                    { k:'telefono', label:'Teléfono', ph:'Ej: 2214567890' },
                    { k:'email',    label:'Email',    ph:'correo@ejemplo.com' },
                  ].map(({ k, label, ph }) => (
                    <div key={k}>
                      <div className="text-xs text-gray-500 mb-1">{label}</div>
                      <input className="input-dark w-full" placeholder={ph}
                        value={manualForm[k]} onChange={e => mf(k, e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && guardarLeadManual()} />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <button onClick={guardarLeadManual} disabled={manualSaving || !manualForm.campana_id}
                    className="btn-primary" style={{ opacity: !manualForm.campana_id ? 0.5 : 1 }}>
                    {manualSaving ? 'Guardando...' : 'Guardar lead'}
                  </button>
                  <button onClick={() => setManualForm(p => ({ ...p, nombre:'', apellido:'', telefono:'', email:'' }))}
                    className="btn-ghost text-xs">Limpiar</button>
                  {manualMsg && (
                    <span className="text-xs" style={{ color: manualMsg.startsWith('✓') ? BRAND : '#ef4444' }}>
                      {manualMsg}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* TAB: Excel de asistentes */}
            {manualTab === 'excel' && (
              <div>
                <div
                  className={'dropzone ' + (excelFile ? 'filled' : '')}
                  style={{ marginBottom:12 }}
                  onClick={() => excelRef.current.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) cargarExcelAsistentes(f) }}>
                  <input ref={excelRef} type="file" accept=".xls,.xlsx" className="hidden"
                    onChange={e => { if(e.target.files[0]) cargarExcelAsistentes(e.target.files[0]) }} />
                  <div className="text-xl mb-1">{excelFile ? '✓' : '↑'}</div>
                  <div className="font-semibold text-sm text-white">
                    {excelLoading ? 'Leyendo archivo...' : excelFile ? 'Archivo cargado' : 'Clic o arrastrar lista de asistentes'}
                  </div>
                  {excelFile
                    ? <div className="text-xs mt-0.5" style={{ color:'#4b5563' }}>{excelFile.name}</div>
                    : <div className="text-xs text-gray-500 mt-0.5">
                        Columnas detectadas automáticamente: Nombre · Apellido · Teléfono · Email
                      </div>
                  }
                </div>

                {excelPreview.length > 0 && (
                  <div>
                    <div className="text-xs mb-2 font-bold" style={{ color: BRAND }}>
                      Vista previa — {excelPreview.length} registros detectados
                    </div>
                    <div className="overflow-x-auto rounded-lg border mb-3"
                      style={{ borderColor:'#2a2a2a', maxHeight:200, overflowY:'auto' }}>
                      <table className="dark-table">
                        <thead>
                          <tr><th>Nombre / Apellido</th><th>Teléfono</th><th>Email</th><th>DNI</th></tr>
                        </thead>
                        <tbody>
                          {excelPreview.slice(0,10).map((r,i) => (
                            <tr key={i}>
                              <td className="text-xs text-white">{[r.nombre, r.apellido].filter(Boolean).join(' ') || '-'}</td>
                              <td className="text-xs text-gray-400">{r.telefono || '-'}</td>
                              <td className="text-xs text-gray-400">{r.email || '-'}</td>
                              <td className="text-xs text-gray-400">{r.dni || '-'}</td>
                            </tr>
                          ))}
                          {excelPreview.length > 10 && (
                            <tr>
                              <td colSpan={4} className="text-xs text-center" style={{ color:'#4b5563' }}>
                                ... y {excelPreview.length - 10} registros más
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={guardarExcelAsistentes} disabled={manualSaving || !manualForm.campana_id}
                        className="btn-primary" style={{ opacity: !manualForm.campana_id ? 0.5 : 1 }}>
                        {manualSaving ? 'Cargando...' : `Cargar ${excelPreview.length} leads`}
                      </button>
                      <button onClick={() => { setExcelFile(null); setExcelPreview([]) }}
                        className="btn-ghost text-xs">Cancelar</button>
                    </div>
                  </div>
                )}

                {manualMsg && (
                  <div className="text-xs mt-2" style={{ color: manualMsg.startsWith('✓') ? BRAND : '#ef4444' }}>
                    {manualMsg}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* TABLA DE LEADS */}
      <div className="card">
        <div className="section-header">
          <h2>Leads cargados</h2>
          <span className="count-badge">{total.toLocaleString('es-AR')} registros</span>
        </div>

        <div className="filter-bar mb-3">
          <input className="input-dark" style={{ width:210 }} placeholder="Buscar nombre, DNI, teléfono..."
            value={filters.search} onChange={e => sf('search', e.target.value)} />
          <div className="filter-sep"/>
          <select className="input-dark" style={{ width:150 }} value={filters.fuente} onChange={e => sf('fuente', e.target.value)}>
            <option value="">Fuente: todas</option>
            <option value="celer">Facilitadores</option>
            <option value="derivado">Derivado</option>
            <option value="manual">Manual</option>
          </select>
          <input className="input-dark" style={{ width:140 }} placeholder="Canal lead..."
            value={filters.canal} onChange={e => sf('canal', e.target.value)} />
          <div className="filter-sep"/>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={!!filters.campana}
              onChange={e => sf('campana', e.target.checked ? '1' : '')} className="accent-[#B5E000]" />
            Con campaña
          </label>
          <div className="filter-sep"/>
          <button onClick={() => { setFilters({ search:'', canal:'', fuente:'', campana:'' }); setPage(0) }}
            className="btn-ghost text-xs flex-shrink-0">Limpiar</button>
        </div>

        <div className="filter-results mb-2">
          Mostrando <span>{leads.length}</span> de <span>{total.toLocaleString('es-AR')}</span> leads
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
          <table className="dark-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Cliente</th><th>DNI</th><th>Teléfono</th>
                <th>Email</th><th>Canal</th><th>Campaña</th><th>Asesor</th><th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-600">Sin leads. Subí los reportes arriba.</td></tr>
              )}
              {leads.map(l => (
                <tr key={l.id}>
                  <td className="text-gray-500 text-xs whitespace-nowrap">
                    {l.fecha_consulta ? String(l.fecha_consulta).slice(0,10) : '—'}
                  </td>
                  <td className="font-medium text-white">
                    {l.apellido ? l.apellido + ', ' + (l.nombre||'') : l.nombre || '—'}
                  </td>
                  <td className="font-mono text-xs text-gray-400">{l.dni || '—'}</td>
                  <td className="font-mono text-xs text-gray-400">{l.telefono || '—'}</td>
                  <td className="text-xs text-gray-400 max-w-xs truncate">{l.email || '—'}</td>
                  <td>{l.canal ? <span className="badge badge-blue">{l.canal}</span> : <span className="text-gray-600">—</span>}</td>
                  <td>
                    {l.codigo_campana
                      ? <span className={'badge ' + (l.campana_id ? 'badge-green' : 'badge-yellow')}>[{l.codigo_campana}]</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="text-gray-400 text-xs">{l.vendedor || '—'}</td>
                  <td>
                    <span className={'badge ' + (l.fuente === 'celer' ? 'badge-green' : l.fuente === 'manual' ? 'badge-yellow' : 'badge-blue')}>
                      {l.fuente === 'celer' ? 'Facilitadores' : l.fuente === 'manual' ? 'Manual' : 'Derivado'}
                    </span>
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
            <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0}
              className="btn-ghost text-xs" style={{ opacity: page===0 ? 0.3 : 1 }}>← Anterior</button>
            <button onClick={() => setPage(p => p+1)} disabled={(page+1)*PAGE>=total}
              className="btn-ghost text-xs" style={{ opacity: (page+1)*PAGE>=total ? 0.3 : 1 }}>Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
