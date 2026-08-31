import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile, normalizeDNI } from '../lib/parsers'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// ── HELPERS ───────────────────────────────────────────────
const fmt = n => n == null ? '—' : new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0
}).format(n)

const fmtROI = r => r == null ? '—'
  : <span className={r >= 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
      {r >= 0 ? '+' : ''}{r}%
    </span>

const MARCAS  = ['TODAS', 'KIARA', 'CIARA', 'PEARA', 'MOVILIS', 'SALRA']
const CANALES = ['Facebook', 'Google Ads', 'Instagram', 'Darwin', 'Chery', 'CompramosTuAuto',
                 'Mercado Libre', 'WhatsApp', 'Presencial', 'Otro']

// ── INLINE EDITABLE CELL ──────────────────────────────────
function EditCell({ value, onSave, type = 'text', options = [] }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value ?? '')
  const ref = useRef()

  const commit = () => {
    setEditing(false)
    if (val !== (value ?? '')) onSave(val === '' ? null : val)
  }

  if (editing) {
    if (options.length) return (
      <select
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        className="w-full border border-[#8BC34A] rounded px-1 py-0.5 text-sm"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
    return (
      <input
        ref={ref}
        autoFocus
        type={type}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="w-full border border-[#8BC34A] rounded px-1 py-0.5 text-sm"
      />
    )
  }

  return (
    <span
      onClick={() => { setVal(value ?? ''); setEditing(true) }}
      className="cursor-pointer px-1.5 py-0.5 rounded hover:bg-green-50 block min-h-[1.5rem]"
      title="Clic para editar"
    >
      {value ?? <span className="text-gray-300 italic text-xs">—</span>}
    </span>
  )
}

// ── MODAL NUEVA CAMPAÑA ───────────────────────────────────
function NuevaCampanaModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    codigo: '', nombre: '', marca: 'TODAS', canal: '',
    presupuesto: 0, fecha_inicio: '', fecha_fin: '', notas: ''
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.nombre.trim()) { alert('El nombre es obligatorio'); return }
    setSaving(true)
    const { error } = await supabase.from('mkt_campanas').insert({
      ...form,
      presupuesto: parseFloat(form.presupuesto) || 0,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin:    form.fecha_fin    || null,
    })
    setSaving(false)
    if (error) alert(error.message)
    else { onSaved(); onClose() }
  }

  const Field = ({ label, children }) => (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )

  const Input = ({ field, ...props }) => (
    <input
      {...props}
      value={form[field]}
      onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#8BC34A]"
    />
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="p-5 border-b">
          <h2 className="font-bold text-gray-800 text-lg">Nueva campaña</h2>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <Field label="Código (ej: fl2, cug)">
            <Input field="codigo" placeholder="fl2" />
          </Field>
          <Field label="Nombre *">
            <Input field="nombre" placeholder="GOLAZZO" />
          </Field>
          <Field label="Marca">
            <select
              value={form.marca}
              onChange={e => setForm(p => ({ ...p, marca: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              {MARCAS.map(m => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Canal">
            <select
              value={form.canal}
              onChange={e => setForm(p => ({ ...p, canal: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Seleccionar...</option>
              {CANALES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Presupuesto ($)">
            <Input field="presupuesto" type="number" placeholder="0" />
          </Field>
          <Field label="Fecha inicio">
            <Input field="fecha_inicio" type="date" />
          </Field>
          <Field label="Fecha fin">
            <Input field="fecha_fin" type="date" />
          </Field>
          <Field label="Notas">
            <Input field="notas" placeholder="Observaciones..." />
          </Field>
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-[#8BC34A] text-white rounded-lg text-sm font-semibold hover:bg-[#7CB342] disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar campaña'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODAL GASTOS ──────────────────────────────────────────
function GastosModal({ campana, onClose, onSaved }) {
  const [gastos, setGastos]     = useState([])
  const [importing, setImporting] = useState(false)
  const [newGasto, setNewGasto]  = useState({ concepto: '', monto: '', fecha: '', proveedor: '' })
  const fileRef = useRef()

  useEffect(() => {
    supabase.from('mkt_gastos').select('*').eq('campana_id', campana.id)
      .order('fecha').then(({ data }) => setGastos(data || []))
  }, [campana.id])

  const addGasto = async () => {
    if (!newGasto.monto) return
    const { data } = await supabase.from('mkt_gastos').insert({
      campana_id: campana.id,
      concepto:   newGasto.concepto || null,
      monto:      parseFloat(newGasto.monto),
      fecha:      newGasto.fecha    || null,
      proveedor:  newGasto.proveedor || null,
    }).select().single()
    setGastos(p => [...p, data])
    setNewGasto({ concepto: '', monto: '', fecha: '', proveedor: '' })
    onSaved()
  }

  const deleteGasto = async (id) => {
    await supabase.from('mkt_gastos').delete().eq('id', id)
    setGastos(p => p.filter(g => g.id !== id))
    onSaved()
  }

  const importExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    const { data } = await parseFile(file)
    const rows = data.map(r => ({
      campana_id: campana.id,
      concepto:   r['Concepto'] || r['CONCEPTO'] || r['concepto'] || null,
      monto:      parseFloat(r['Monto'] || r['MONTO'] || r['monto'] || 0),
      fecha:      r['Fecha'] || r['FECHA'] || r['fecha'] || null,
      proveedor:  r['Proveedor'] || r['PROVEEDOR'] || r['proveedor'] || null,
    })).filter(r => r.monto > 0)

    if (rows.length > 0) {
      await supabase.from('mkt_gastos').insert(rows)
      const { data: updated } = await supabase.from('mkt_gastos').select('*').eq('campana_id', campana.id)
      setGastos(updated || [])
      onSaved()
    }
    setImporting(false)
  }

  const total = gastos.reduce((s, g) => s + (g.monto || 0), 0)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">Gastos — {campana.nombre}</h2>
            <div className="text-sm text-gray-500 mt-0.5">Total: {fmt(total)}</div>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={importExcel} />
            <button
              onClick={() => fileRef.current.click()}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50"
            >
              {importing ? '⏳ Importando...' : '📥 Importar Excel'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {gastos.map(g => (
            <div key={g.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <div className="font-medium text-sm">{g.concepto || '—'}</div>
                <div className="text-xs text-gray-500">{g.proveedor} {g.fecha ? `· ${g.fecha}` : ''}</div>
              </div>
              <div className="font-bold text-sm">{fmt(g.monto)}</div>
              <button onClick={() => deleteGasto(g.id)} className="text-red-400 hover:text-red-600 text-xs px-2">✕</button>
            </div>
          ))}
          {gastos.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">Sin gastos registrados</div>
          )}
        </div>

        {/* Nuevo gasto */}
        <div className="p-5 border-t bg-gray-50 rounded-b-2xl">
          <div className="text-xs font-semibold text-gray-600 mb-2">Agregar gasto</div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { key: 'concepto',  ph: 'Concepto' },
              { key: 'proveedor', ph: 'Proveedor' },
              { key: 'fecha',     ph: 'Fecha',    type: 'date' },
              { key: 'monto',     ph: 'Monto $',  type: 'number' },
            ].map(f => (
              <input
                key={f.key}
                type={f.type || 'text'}
                placeholder={f.ph}
                value={newGasto[f.key]}
                onChange={e => setNewGasto(p => ({ ...p, [f.key]: e.target.value }))}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              />
            ))}
          </div>
          <div className="flex justify-between mt-3">
            <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-white">
              Cerrar
            </button>
            <button
              onClick={addGasto}
              className="px-4 py-2 bg-[#8BC34A] text-white rounded-lg text-sm font-semibold hover:bg-[#7CB342]"
            >
              + Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MAIN CAMPANAS PAGE ────────────────────────────────────
export default function Campanas() {
  const [performance, setPerformance] = useState([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [gastosFor, setGastosFor]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('mkt_campanas_performance')
      .select('*')
      .order('gasto_total', { ascending: false })
    setPerformance(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function updateField(id, field, value) {
    await supabase.from('mkt_campanas').update({ [field]: value, updated_at: new Date() }).eq('id', id)
    setPerformance(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  // Datos para el gráfico
  const chartData = performance.slice(0, 8).map(c => ({
    name: c.nombre.length > 12 ? c.nombre.slice(0, 12) + '…' : c.nombre,
    Gasto:   Math.round((c.gasto_total || 0) / 1000),
    Ingreso: Math.round((c.ingreso_total || 0) / 1000),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Campañas</h1>
          <p className="text-gray-500 text-sm mt-1">
            Registro de campañas · Gastos · Performance. Hacé clic en cualquier celda para editar.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-[#8BC34A] text-white font-semibold rounded-lg hover:bg-[#7CB342] text-sm"
        >
          + Nueva campaña
        </button>
      </div>

      {/* GRÁFICO GASTO vs INGRESO */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Gasto vs Ingreso por campaña (miles $)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}K`} />
              <Tooltip formatter={(v, n) => [`$${v.toLocaleString('es-AR')}K`, n]} />
              <Legend />
              <Bar dataKey="Gasto"   fill="#ef5350" radius={[4,4,0,0]} />
              <Bar dataKey="Ingreso" fill="#8BC34A" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* TABLA DE PERFORMANCE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Código</th>
                <th className="text-left px-4 py-3">Nombre</th>
                <th className="text-left px-4 py-3">Marca</th>
                <th className="text-left px-4 py-3">Canal</th>
                <th className="text-right px-4 py-3">Presupuesto</th>
                <th className="text-right px-4 py-3">Gasto total</th>
                <th className="text-right px-4 py-3">Leads</th>
                <th className="text-right px-4 py-3">Ventas</th>
                <th className="text-right px-4 py-3">Ingreso</th>
                <th className="text-right px-4 py-3">CAC</th>
                <th className="text-right px-4 py-3">ROI</th>
                <th className="text-center px-4 py-3">Gastos</th>
                <th className="text-center px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={13} className="text-center py-8 text-gray-400">Cargando...</td></tr>
              )}
              {!loading && performance.length === 0 && (
                <tr>
                  <td colSpan={13} className="text-center py-10 text-gray-400">
                    <div className="text-3xl mb-2">🎯</div>
                    <div>Sin campañas. Creá la primera con el botón de arriba.</div>
                  </td>
                </tr>
              )}
              {performance.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2">
                    <EditCell value={c.codigo} onSave={v => updateField(c.id, 'codigo', v)} />
                  </td>
                  <td className="px-4 py-2 font-medium">
                    <EditCell value={c.nombre} onSave={v => updateField(c.id, 'nombre', v)} />
                  </td>
                  <td className="px-4 py-2">
                    <EditCell value={c.marca} onSave={v => updateField(c.id, 'marca', v)} options={MARCAS} />
                  </td>
                  <td className="px-4 py-2">
                    <EditCell value={c.canal} onSave={v => updateField(c.id, 'canal', v)} options={['', ...CANALES]} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <EditCell
                      value={c.presupuesto ? Math.round(c.presupuesto).toLocaleString('es-AR') : '0'}
                      onSave={v => updateField(c.id, 'presupuesto', parseFloat(v.replace(/\D/g,'')) || 0)}
                      type="number"
                    />
                  </td>
                  <td className="px-4 py-2 text-right text-gray-700">{fmt(c.gasto_total)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="font-semibold text-blue-600">{c.total_leads ?? 0}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="font-semibold text-green-600">{c.total_ventas ?? 0}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{fmt(c.ingreso_total)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{fmt(c.cac)}</td>
                  <td className="px-4 py-2 text-right">{fmtROI(c.roi_porcentaje)}</td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setGastosFor(c)}
                      className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-100"
                    >
                      💸 {fmt(c.gastos_adicionales)}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => updateField(c.id, 'activa', !c.activa)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${c.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {c.activa ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SIN MAPEAR */}
      <UnmappedCodes onMap={load} />

      {showModal && <NuevaCampanaModal onClose={() => setShowModal(false)} onSaved={load} />}
      {gastosFor  && <GastosModal campana={gastosFor} onClose={() => setGastosFor(null)} onSaved={load} />}
    </div>
  )
}

/** Muestra los leads con código de campaña no mapeado */
function UnmappedCodes({ onMap }) {
  const [codes, setCodes]     = useState([])
  const [campanas, setCampanas] = useState([])
  const [mapping, setMapping]  = useState({})

  useEffect(() => {
    Promise.all([
      supabase.from('mkt_leads')
        .select('codigo_campana')
        .not('codigo_campana', 'is', null)
        .is('campana_id', null),
      supabase.from('mkt_campanas').select('id, nombre')
    ]).then(([{ data: leads }, { data: camp }]) => {
      const unique = [...new Set((leads || []).map(l => l.codigo_campana))]
      setCodes(unique)
      setCampanas(camp || [])
    })
  }, [])

  const mapCode = async (code, campanaId) => {
    await supabase.from('mkt_leads')
      .update({ campana_id: campanaId })
      .eq('codigo_campana', code)
    await supabase.from('mkt_campanas')
      .update({ codigo: code })
      .eq('id', campanaId)
    setCodes(prev => prev.filter(c => c !== code))
    onMap()
  }

  if (codes.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
      <h3 className="font-semibold text-amber-800 mb-1">⚠️ Códigos sin mapear ({codes.length})</h3>
      <p className="text-sm text-amber-700 mb-4">
        Estos códigos aparecen en los leads pero no están vinculados a ninguna campaña registrada.
        Asigná cada uno a una campaña existente.
      </p>
      <div className="space-y-2">
        {codes.map(code => (
          <div key={code} className="flex items-center gap-3">
            <code className="bg-amber-100 px-2 py-1 rounded text-amber-900 font-mono text-sm min-w-[80px]">
              [{code}]
            </code>
            <select
              value={mapping[code] || ''}
              onChange={e => setMapping(p => ({ ...p, [code]: e.target.value }))}
              className="border border-amber-200 rounded-lg px-3 py-1.5 text-sm flex-1 max-w-xs"
            >
              <option value="">Seleccionar campaña...</option>
              {campanas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <button
              onClick={() => mapping[code] && mapCode(code, mapping[code])}
              disabled={!mapping[code]}
              className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 disabled:opacity-40"
            >
              Vincular
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
