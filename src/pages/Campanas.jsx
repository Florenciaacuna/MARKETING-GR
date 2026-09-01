import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile } from '../lib/parsers'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const BRAND  = '#B5E000'
const MARCAS = ['TODAS', 'KIARA', 'CIARA', 'PEARA', 'MOVILIS', 'SALRA']
const CANALES = ['Facebook', 'Google Ads', 'Instagram', 'Darwin', 'Chery',
                 'CompramosTuAuto', 'Mercado Libre', 'WhatsApp', 'Presencial', 'Otro']

const fmt = n => n == null ? '—' : new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
}).format(n)

const customTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs border" style={{ background:'#1a1a1a', borderColor:'#2a2a2a', color:'#d1d5db' }}>
      <div className="font-bold text-white mb-1">{label}</div>
      {payload.map((p,i) => <div key={i} style={{color:p.color}}>{p.name}: {fmt(p.value)}</div>)}
    </div>
  )
}

// ── CELDA EDITABLE ───────────────────────────────────────
function EditCell({ value, onSave, options = [], type = 'text' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value ?? '')
  const commit = () => { setEditing(false); if (val !== (value ?? '')) onSave(val || null) }
  if (editing) {
    if (options.length) return (
      <select autoFocus value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
        className="w-full text-xs" style={{ background:'#111', border:'1px solid #B5E000', borderRadius:4, color:'white', padding:'2px 6px' }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
    return (
      <input autoFocus type={type} value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false) }}
        className="w-full text-xs" style={{ background:'#111', border:'1px solid #B5E000', borderRadius:4, color:'white', padding:'2px 6px' }}
      />
    )
  }
  return (
    <span onClick={() => { setVal(value ?? ''); setEditing(true) }}
      className="block cursor-pointer rounded px-1.5 py-0.5 min-h-[1.5rem] text-xs hover:bg-white/5 transition-colors"
      title="Clic para editar">
      {value ?? <span className="text-gray-600 italic">—</span>}
    </span>
  )
}

// ── MODAL NUEVA CAMPAÑA ──────────────────────────────────
function NuevaCampanaModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ codigo:'', nombre:'', marca:'TODAS', canal:'', presupuesto:0, fecha_inicio:'', fecha_fin:'' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.nombre.trim()) { alert('El nombre es obligatorio'); return }
    setSaving(true)
    await supabase.from('mkt_campanas').insert({ ...form, presupuesto: parseFloat(form.presupuesto)||0 })
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background:'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl border" style={{ background:'#1a1a1a', borderColor:'#2a2a2a' }}>
        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor:'#2a2a2a' }}>
          <h2 className="font-bold text-white">Nueva campaña</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          {[
            { label:'Código (ej: fl2)', key:'codigo', ph:'fl2' },
            { label:'Nombre *', key:'nombre', ph:'GOLAZZO' },
          ].map(f => (
            <label key={f.key} className="block">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{f.label}</span>
              <input value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                placeholder={f.ph} className="input-dark mt-1" />
            </label>
          ))}
          <label className="block">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Marca</span>
            <select value={form.marca} onChange={e => set('marca', e.target.value)} className="input-dark mt-1">
              {MARCAS.map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Canal</span>
            <select value={form.canal} onChange={e => set('canal', e.target.value)} className="input-dark mt-1">
              <option value="">Seleccionar...</option>
              {CANALES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Presupuesto ($)</span>
            <input type="number" value={form.presupuesto} onChange={e => set('presupuesto', e.target.value)} className="input-dark mt-1" />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Fecha inicio</span>
            <input type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} className="input-dark mt-1" />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Fecha fin</span>
            <input type="date" value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} className="input-dark mt-1" />
          </label>
        </div>
        <div className="p-5 border-t flex justify-end gap-3" style={{ borderColor:'#2a2a2a' }}>
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────
export default function Campanas() {
  const [perf,       setPerf]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [activeTab,  setActiveTab]  = useState('performance') // 'performance' | 'gastos' | 'registro'

  // Upload gastos
  const fileRef    = useRef()
  const [fileGasto, setFileGasto]  = useState(null)
  const [uploading,  setUploading] = useState(false)
  const [uploadMsg,  setUploadMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('mkt_campanas_performance')
      .select('*')
      .order('gasto_total', { ascending: false })
    setPerf(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const update = async (id, field, value) => {
    await supabase.from('mkt_campanas').update({ [field]: value }).eq('id', id)
    setPerf(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  // Importar Excel de gastos
  async function importarGastos() {
    if (!fileGasto) return
    setUploading(true); setUploadMsg('')

    const { data: rows } = await parseFile(fileGasto)

    if (!rows || rows.length === 0) {
      setUploadMsg('Error: el archivo no se pudo leer o está vacío')
      setUploading(false); return
    }

    // Parser de monto robusto — maneja números reales, strings con puntos/comas
    const parseMonto = (val) => {
      if (val === null || val === undefined || val === '') return 0
      // Si ya es número JS (SheetJS con raw:true lo manda así)
      if (typeof val === 'number') return Math.abs(val)
      // Si es string — limpiar formato argentino
      const str = String(val)
        .replace(/[^0-9,.-]/g, '')   // sacar $, espacios, letras
        .replace(/\.(?=\d{3})/g, '') // sacar punto de miles: 1.500 → 1500
        .replace(',', '.')           // coma decimal → punto: 1500,50 → 1500.50
      return Math.abs(parseFloat(str) || 0)
    }

    const gastos = rows.map(r => {
      const rawMonto = r['MONTO'] ?? r['monto'] ?? r['Monto'] ?? r['monto '] ?? null
      const monto    = parseMonto(rawMonto)
      return {
        campana_nombre: r['campaña'] || r['CAMPAÑA'] || r['Campaña'] || null,
        monto,
        concepto:       r['Concepto'] || r['CONCEPTO'] || null,
        fecha:          r['FECHA']    || r['fecha']    || null,
        proveedor:      r['Notas']    || r['NOTAS']    || null,
        _rawMonto:      rawMonto,  // para debug
      }
    })

    const conMonto = gastos.filter(g => g.monto > 0)

    if (conMonto.length === 0) {
      // Mostrar valores reales del campo MONTO para diagnóstico
      const muestra = gastos.slice(0, 3)
        .map(g => `"${g._rawMonto}" (${typeof g._rawMonto})`)
        .join(' | ')
      setUploadMsg(`Sin montos válidos. Valores leídos en MONTO: ${muestra}`)
      setUploading(false); return
    }

    // Buscar campañas por nombre o código
    const { data: campanas } = await supabase.from('mkt_campanas').select('id, nombre, codigo')
    const byNombre = new Map(campanas?.map(c => [c.nombre.toLowerCase().trim(), c]) || [])
    const byCodigo = new Map(campanas?.filter(c=>c.codigo).map(c => [c.codigo.toLowerCase().trim(), c]) || [])

    let guardados = 0; let sinCampana = 0
    for (const g of conMonto) {
      let campana = null
      if (g.campana_nombre) {
        campana = byNombre.get(g.campana_nombre.toLowerCase().trim()) ||
                  byCodigo.get(g.campana_nombre.toLowerCase().trim())
      }
      if (!campana) sinCampana++
      const { error } = await supabase.from('mkt_gastos').insert({
        campana_id: campana?.id || null,
        concepto:   g.concepto,
        monto:      g.monto,
        fecha:      g.fecha,
        proveedor:  g.proveedor,
      })
      if (!error) guardados++
    }

    setUploadMsg(`${guardados} gastos importados. ${sinCampana} sin campaña asignada.`)
    setUploading(false); setFileGasto(null)
    load()
  }

  // Datos para el gráfico
  const chartData = perf.slice(0, 8).map(c => ({
    name:    c.nombre.length > 14 ? c.nombre.slice(0,14)+'…' : c.nombre,
    Gasto:   Math.round((c.gasto_total    || 0) / 1000),
    Ingreso: Math.round((c.ingreso_total  || 0) / 1000),
    Ventas:  c.total_ventas || 0,
  }))

  return (
    <div className="space-y-5">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-white text-base">Campañas</h2>
          <p className="text-xs text-gray-500 mt-0.5">Registro · Gastos · Performance vs ventas</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary text-xs">+ Nueva campaña</button>
      </div>

      {/* TABS */}
      <div className="flex gap-1 border-b" style={{ borderColor:'#2a2a2a' }}>
        {[
          { id:'performance', label:'Performance' },
          { id:'gastos',      label:'Cargar gastos' },
          { id:'registro',    label:'Registro de campañas' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all -mb-px
              ${activeTab === t.id
                ? 'text-white border-[#B5E000]'
                : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PESTAÑA: PERFORMANCE ── */}
      {activeTab === 'performance' && (
        <div className="space-y-5">

          {/* Gráfico */}
          {chartData.length > 0 && (
            <div className="card">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
                Gasto vs Ingreso por campaña (miles $)
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top:5, right:20, left:0, bottom:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a"/>
                  <XAxis dataKey="name" tick={{ fontSize:10, fill:'#6b7280' }}/>
                  <YAxis tick={{ fontSize:11, fill:'#6b7280' }} tickFormatter={v=>`$${v}K`}/>
                  <Tooltip content={customTooltip}/>
                  <Legend wrapperStyle={{ fontSize:12, color:'#9ca3af' }}/>
                  <Bar dataKey="Gasto"   fill="#ef4444" radius={[4,4,0,0]}/>
                  <Bar dataKey="Ingreso" fill={BRAND}   radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla de performance */}
          <div className="card">
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
              <table className="dark-table">
                <thead><tr>
                  <th>Campaña</th>
                  <th>Marca</th>
                  <th>Canal</th>
                  <th className="text-right">Presupuesto</th>
                  <th className="text-right">Gasto total</th>
                  <th className="text-right">Leads</th>
                  <th className="text-right">Ventas atrib.</th>
                  <th className="text-right">Ingreso ✏️</th>
                  <th className="text-right">CAC</th>
                  <th className="text-right">ROI</th>
                </tr></thead>
                <tbody>
                  {loading && <tr><td colSpan={10} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
                  {!loading && perf.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-10 text-gray-600">
                      Sin campañas. Creá la primera con el botón de arriba.
                    </td></tr>
                  )}
                  {perf.map(c => {
                    const roi = c.roi_porcentaje
                    const roiColor = roi == null ? '#6b7280' : roi >= 0 ? '#B5E000' : '#f87171'
                    return (
                      <tr key={c.id}>
                        <td className="font-semibold text-white">
                          {c.nombre}
                          {c.codigo && <span className="ml-1 badge badge-gray text-xs">[{c.codigo}]</span>}
                        </td>
                        <td>{c.marca ? <span className="badge badge-gray">{c.marca}</span> : '—'}</td>
                        <td>{c.canal ? <span className="badge badge-blue">{c.canal}</span> : '—'}</td>
                        <td className="text-right text-gray-400 text-xs">{fmt(c.presupuesto)}</td>
                        <td className="text-right text-gray-300 text-xs font-semibold">{fmt(c.gasto_total)}</td>
                        <td className="text-right font-bold" style={{ color:'#60a5fa' }}>{c.total_leads ?? 0}</td>
                        <td className="text-right font-bold" style={{ color: BRAND }}>{c.total_ventas ?? 0}</td>
                        <td className="text-right">
                          <EditCell
                            value={c.ingreso_total ? Math.round(c.ingreso_total).toLocaleString('es-AR') : '0'}
                            onSave={async v => {
                              const val = parseFloat(String(v).replace(/[^0-9,.]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.')) || 0
                              await supabase.from('mkt_campanas').update({ ingreso_manual: val }).eq('id', c.id)
                              load()
                            }}
                            type="number"
                          />
                        </td>
                        <td className="text-right text-gray-400 text-xs">{fmt(c.cac)}</td>
                        <td className="text-right font-bold text-sm" style={{ color: roiColor }}>
                          {roi != null ? `${roi >= 0 ? '+' : ''}${roi}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 p-3 rounded-lg text-xs text-gray-500" style={{ background:'#111', border:'1px solid #1f1f1f' }}>
              <span style={{color:'#B5E000'}}>✏️ Ingreso:</span> hacé clic en la celda para ingresar el ingreso total de la campaña (margen auto + gestoria de las ventas atribuidas). 
              Las <strong className="text-gray-400">Ventas atrib.</strong> se actualizan automáticamente al ejecutar el cruce en <strong className="text-gray-400">Asignados</strong>.
              El <strong className="text-gray-400">Gasto total</strong> incluye el presupuesto + los gastos importados del Excel de Compras.
            </div>
          </div>
        </div>
      )}

      {/* ── PESTAÑA: CARGAR GASTOS ── */}
      {activeTab === 'gastos' && (
        <div className="space-y-5">
          <div className="card">
            <h3 className="font-bold text-white mb-1">Importar gastos desde Excel</h3>
            <p className="text-xs text-gray-500 mb-5">
              Subí el Excel de gastos del área de Compras. El sistema intenta asociar cada gasto a una campaña por nombre o código.
            </p>

            {/* Formato esperado */}
            <div className="mb-5">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Formato del Excel</div>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor:'#2a2a2a' }}>
                <table className="dark-table text-xs">
                  <thead><tr><th>Columna</th><th>Descripción</th><th>Requerida</th></tr></thead>
                  <tbody>
                    {[
                      { col:'campaña',   desc:'Nombre o código de la campaña (ej: GOLAZZO o fl2)', req:true  },
                      { col:'MONTO',     desc:'Monto del gasto en pesos',                          req:true  },
                      { col:'Concepto',  desc:'Descripción del gasto',                             req:false },
                      { col:'FECHA',     desc:'Fecha del gasto (dd/mm/aaaa)',                      req:false },
                      { col:'Notas',     desc:'Observaciones adicionales',                         req:false },
                    ].map(f => (
                      <tr key={f.col}>
                        <td><span className="font-mono" style={{ color: BRAND }}>{f.col}</span></td>
                        <td className="text-gray-400">{f.desc}</td>
                        <td><span className={`badge ${f.req ? 'badge-green' : 'badge-gray'}`}>{f.req ? 'Sí' : 'No'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Drop zone */}
            <div
              className={`dropzone mb-4 ${fileGasto ? 'filled' : ''}`}
              onClick={() => fileRef.current.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) setFileGasto(f) }}
            >
              <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" className="hidden"
                onChange={e => e.target.files[0] && setFileGasto(e.target.files[0])} />
              <div className="text-2xl mb-1">{fileGasto ? '✓' : '↑'}</div>
              <div className="font-semibold text-sm text-white">Excel de gastos</div>
              <div className="text-xs text-gray-500 mt-0.5">Exportación del área de Compras</div>
              {fileGasto
                ? <div className="text-xs mt-1" style={{ color: BRAND }}>{fileGasto.name}</div>
                : <div className="text-xs mt-1 text-gray-600">Clic o arrastrar archivo .xls / .xlsx</div>}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={importarGastos} disabled={uploading || !fileGasto} className="btn-primary">
                {uploading ? 'Importando...' : 'Importar gastos'}
              </button>
              {uploadMsg && <span className="text-xs" style={{ color: BRAND }}>{uploadMsg}</span>}
            </div>
          </div>

          {/* Gastos cargados por campaña */}
          <GastosTable perf={perf} />
        </div>
      )}

      {/* ── PESTAÑA: REGISTRO DE CAMPAÑAS ── */}
      {activeTab === 'registro' && (
        <div className="card">
          <p className="text-xs text-gray-500 mb-4">
            Hacé clic en cualquier celda para editarla. El código es el que aparece en los leads (ej: <span style={{color:BRAND}}>[fl2]</span>).
          </p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
            <table className="dark-table">
              <thead><tr>
                <th>Código</th><th>Nombre</th><th>Marca</th><th>Canal</th>
                <th>Presupuesto</th><th>Inicio</th><th>Fin</th><th>Estado</th>
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="text-center py-8 text-gray-600">Cargando...</td></tr>}
                {perf.map(c => (
                  <tr key={c.id}>
                    <td><EditCell value={c.codigo}       onSave={v => update(c.id,'codigo',v)} /></td>
                    <td><EditCell value={c.nombre}       onSave={v => update(c.id,'nombre',v)} /></td>
                    <td><EditCell value={c.marca}        onSave={v => update(c.id,'marca',v)} options={MARCAS} /></td>
                    <td><EditCell value={c.canal}        onSave={v => update(c.id,'canal',v)} options={['', ...CANALES]} /></td>
                    <td><EditCell value={c.presupuesto ? Math.round(c.presupuesto).toLocaleString('es-AR') : '0'}
                      onSave={v => update(c.id,'presupuesto', parseFloat(v.replace(/\D/g,''))||0)} type="number" /></td>
                    <td><EditCell value={c.fecha_inicio} onSave={v => update(c.id,'fecha_inicio',v)} type="date" /></td>
                    <td><EditCell value={c.fecha_fin}    onSave={v => update(c.id,'fecha_fin',v)} type="date" /></td>
                    <td>
                      <button onClick={() => update(c.id,'activa',!c.activa)}
                        className={`badge ${c.activa ? 'badge-green' : 'badge-gray'} cursor-pointer`}>
                        {c.activa ? 'Activa' : 'Inactiva'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Códigos sin mapear */}
          <UnmappedCodes onMap={load} campanas={perf} />
        </div>
      )}

      {showModal && <NuevaCampanaModal onClose={() => setShowModal(false)} onSaved={load} />}
    </div>
  )
}

// ── GASTOS POR CAMPAÑA ────────────────────────────────────
function GastosTable({ perf, onReload }) {
  const [gastos,  setGastos]  = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting,setDeleting]= useState(false)

  const loadGastos = () => {
    setLoading(true)
    supabase.from('mkt_gastos').select('*,mkt_campanas(nombre)').order('fecha', { ascending:false }).limit(200)
      .then(({ data }) => { setGastos(data || []); setLoading(false) })
  }

  useEffect(() => { loadGastos() }, [perf])

  const total = gastos.reduce((s, g) => s + (g.monto||0), 0)

  const updateGasto = async (id, field, value) => {
    const val = field === 'monto' ? (parseFloat(String(value).replace(/[^0-9,.]/g,'').replace('.','').replace(',','.')) || 0) : value
    await supabase.from('mkt_gastos').update({ [field]: val }).eq('id', id)
    setGastos(prev => prev.map(g => g.id === id ? { ...g, [field]: val } : g))
    if (onReload) onReload()
  }

  const deleteGasto = async (id) => {
    await supabase.from('mkt_gastos').delete().eq('id', id)
    setGastos(prev => prev.filter(g => g.id !== id))
    if (onReload) onReload()
  }

  const deleteAll = async () => {
    if (!window.confirm(`¿Seguro que querés borrar los ${gastos.length} gastos cargados? Esta acción no se puede deshacer.`)) return
    setDeleting(true)
    await supabase.from('mkt_gastos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setGastos([])
    setDeleting(false)
    if (onReload) onReload()
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-white text-sm">Gastos registrados</h3>
          <div className="text-xs text-gray-500 mt-0.5">Clic en cualquier celda para editar · El monto se puede corregir directo</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold" style={{ color: BRAND }}>{fmt(total)} total</span>
          {gastos.length > 0 && (
            <button onClick={deleteAll} disabled={deleting}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-40">
              {deleting ? 'Borrando...' : 'Borrar todos'}
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
        <table className="dark-table">
          <thead><tr>
            <th>Campaña</th><th>Concepto</th><th>Notas</th><th>Fecha</th>
            <th className="text-right">Monto</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center py-6 text-gray-600">Cargando...</td></tr>}
            {!loading && gastos.length === 0 && (
              <tr><td colSpan={6} className="text-center py-6 text-gray-600">Sin gastos cargados</td></tr>
            )}
            {gastos.map(g => (
              <tr key={g.id}>
                <td>
                  {g.mkt_campanas?.nombre
                    ? <span className="badge badge-green">{g.mkt_campanas.nombre}</span>
                    : <span className="badge badge-gray">Sin asignar</span>}
                </td>
                <td><EditCell value={g.concepto} onSave={v => updateGasto(g.id,'concepto',v)} /></td>
                <td><EditCell value={g.proveedor} onSave={v => updateGasto(g.id,'proveedor',v)} /></td>
                <td className="text-xs text-gray-500">{g.fecha || '—'}</td>
                <td className="text-right">
                  <EditCell
                    value={g.monto ? g.monto.toLocaleString('es-AR') : '0'}
                    onSave={v => updateGasto(g.id,'monto',v)}
                    type="number"
                  />
                </td>
                <td>
                  <button onClick={() => deleteGasto(g.id)}
                    className="text-xs text-red-700 hover:text-red-400 px-2 transition-colors">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// ── CÓDIGOS SIN MAPEAR ────────────────────────────────────
function UnmappedCodes({ onMap, campanas }) {
  const [codes, setCodes]   = useState([])
  const [map,   setMap]     = useState({})

  useEffect(() => {
    supabase.from('mkt_leads').select('codigo_campana').not('codigo_campana','is',null).is('campana_id',null)
      .then(({ data }) => {
        const unique = [...new Set((data||[]).map(l=>l.codigo_campana))]
        setCodes(unique)
      })
  }, [])

  const vincular = async (code, campanaId) => {
    await supabase.from('mkt_leads').update({ campana_id: campanaId }).eq('codigo_campana', code)
    await supabase.from('mkt_campanas').update({ codigo: code }).eq('id', campanaId)
    setCodes(p => p.filter(c => c !== code))
    onMap()
  }

  if (!codes.length) return null

  return (
    <div className="mt-4 p-4 rounded-xl border" style={{ background:'#1a1500', borderColor:'#fbbf24' }}>
      <h4 className="font-bold text-yellow-400 text-sm mb-1">Códigos sin mapear ({codes.length})</h4>
      <p className="text-xs text-yellow-600 mb-3">
        Estos códigos aparecen en los leads pero no están vinculados a ninguna campaña. Asignalos para que el cruce funcione.
      </p>
      <div className="space-y-2">
        {codes.map(code => (
          <div key={code} className="flex items-center gap-3">
            <code className="px-2 py-1 rounded text-xs font-mono" style={{ background:'#2a1f00', color: BRAND }}>[{code}]</code>
            <select value={map[code]||''} onChange={e => setMap(p=>({...p,[code]:e.target.value}))}
              className="input-dark flex-1 max-w-xs text-xs">
              <option value="">Seleccionar campaña...</option>
              {campanas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <button onClick={() => map[code] && vincular(code, map[code])}
              disabled={!map[code]}
              className="btn-primary text-xs px-3 py-1.5">
              Vincular
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
