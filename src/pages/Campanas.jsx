import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BRAND = '#B5E000'
const fmt   = n  => (n||0).toLocaleString('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 })
const fmtN  = n  => (n||0).toLocaleString('es-AR')
const today = () => new Date().toISOString().slice(0,10)

const RUBROS = ['0KM','PDA','USADOS','V.E','COMPRA','POSTVENTA']
const MARCAS = ['KIARA','CIARA','PEARA','GRUPO','SELECCIÓN','LA FÁBRICA','CHERY','RENAULT']

const emptyForm = { concepto:'', monto:'', fecha: today(), proveedor:'' }

export default function Campanas() {
  const [campanas,    setCampanas]    = useState([])
  const [gastos,      setGastos]      = useState({})       // { campana_id: [...gastos] }
  const [expanded,    setExpanded]    = useState(null)     // campana_id abierta
  const [form,        setForm]        = useState(emptyForm)
  const [saving,      setSaving]      = useState(false)
  const [editGasto,   setEditGasto]   = useState(null)     // { id, ... } gasto en edicion
  const [search,      setSearch]      = useState('')
  const [filtroMarca, setFiltroMarca] = useState('')
  const [filtroRubro, setFiltroRubro] = useState('')
  const [loading,     setLoading]     = useState(true)

  useEffect(() => { loadCampanas() }, [])

  async function loadCampanas() {
    setLoading(true)
    const { data } = await supabase
      .from('mkt_campanas')
      .select('id,codigo,nombre,marca,rubro,activo')
      .order('marca').order('nombre')
    setCampanas(data || [])
    setLoading(false)
  }

  async function loadGastos(campanaId) {
    const { data } = await supabase
      .from('mkt_gastos')
      .select('id,concepto,monto,fecha,proveedor')
      .eq('campana_id', campanaId)
      .order('fecha', { ascending: false })
    setGastos(prev => ({ ...prev, [campanaId]: data || [] }))
  }

  function toggle(id) {
    if (expanded === id) {
      setExpanded(null)
    } else {
      setExpanded(id)
      setForm(emptyForm)
      setEditGasto(null)
      if (!gastos[id]) loadGastos(id)
    }
  }

  async function guardarGasto(campanaId) {
    if (!form.concepto || !form.monto || !form.fecha) return
    setSaving(true)
    const { error } = await supabase.from('mkt_gastos').insert({
      campana_id: campanaId,
      concepto:   form.concepto.trim(),
      monto:      parseFloat(String(form.monto).replace(/\./g,'').replace(',','.')),
      fecha:      form.fecha,
      proveedor:  form.proveedor.trim() || null
    })
    if (!error) {
      setForm(emptyForm)
      await loadGastos(campanaId)
    }
    setSaving(false)
  }

  async function eliminarGasto(campanaId, gastoId) {
    if (!confirm('¿Eliminar este gasto?')) return
    await supabase.from('mkt_gastos').delete().eq('id', gastoId)
    await loadGastos(campanaId)
  }

  async function guardarEdicion(campanaId) {
    if (!editGasto) return
    setSaving(true)
    await supabase.from('mkt_gastos').update({
      concepto:  editGasto.concepto,
      monto:     parseFloat(String(editGasto.monto).replace(/\./g,'').replace(',','.')),
      fecha:     editGasto.fecha,
      proveedor: editGasto.proveedor || null
    }).eq('id', editGasto.id)
    setEditGasto(null)
    await loadGastos(campanaId)
    setSaving(false)
  }

  const filtered = campanas.filter(c => {
    if (filtroMarca && c.marca !== filtroMarca) return false
    if (filtroRubro && c.rubro !== filtroRubro) return false
    if (search && !c.nombre.toLowerCase().includes(search.toLowerCase()) &&
        !c.codigo.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalGastos = id => (gastos[id] || []).reduce((s,g) => s + (g.monto||0), 0)

  return (
    <div className="space-y-4">

      {/* FILTROS */}
      <div className="card">
        <div className="filter-bar">
          <input className="input-dark" style={{ width:220 }} placeholder="Buscar campaña o código..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="filter-sep"/>
          <select className="input-dark" style={{ width:140 }} value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}>
            <option value="">Marca: todas</option>
            {MARCAS.map(m => <option key={m}>{m}</option>)}
          </select>
          <select className="input-dark" style={{ width:140 }} value={filtroRubro} onChange={e => setFiltroRubro(e.target.value)}>
            <option value="">Rubro: todos</option>
            {RUBROS.map(r => <option key={r}>{r}</option>)}
          </select>
          <div className="filter-sep"/>
          <button onClick={() => { setSearch(''); setFiltroMarca(''); setFiltroRubro('') }}
            className="btn-ghost text-xs">Limpiar</button>
        </div>
        <div className="filter-results mt-2">
          Mostrando <span>{filtered.length}</span> de {campanas.length} campañas
        </div>
      </div>

      {/* LISTA DE CAMPAÑAS */}
      {loading ? (
        <div className="card text-center text-gray-500 text-xs py-8">Cargando campañas...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const isOpen  = expanded === c.id
            const gList   = gastos[c.id] || []
            const total   = totalGastos(c.id)

            return (
              <div key={c.id} className="card" style={{ padding:0, overflow:'hidden' }}>

                {/* Header de la campaña */}
                <div
                  className="flex items-center gap-3 cursor-pointer px-4 py-3"
                  style={{ background: isOpen ? '#1a2e00' : '#111', transition:'background 0.15s' }}
                  onClick={() => toggle(c.id)}>

                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{c.nombre}</span>
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                        style={{ background:'#2a3d00', color: BRAND }}>[{c.codigo}]</span>
                      {!c.activo && (
                        <span className="badge badge-gray text-xs">Inactiva</span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-0.5">
                      <span className="text-xs" style={{ color:'#6b7280' }}>{c.marca}</span>
                      <span className="badge badge-gray" style={{ fontSize:'0.6rem' }}>{c.rubro}</span>
                    </div>
                  </div>

                  {/* Total gastos si ya se cargaron */}
                  {gastos[c.id] !== undefined && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-bold" style={{ color: total > 0 ? BRAND : '#4b5563' }}>
                        {total > 0 ? fmt(total) : 'Sin gastos'}
                      </div>
                      {gList.length > 0 && (
                        <div className="text-xs" style={{ color:'#4b5563' }}>{gList.length} registro{gList.length !== 1 ? 's' : ''}</div>
                      )}
                    </div>
                  )}

                  <div style={{ color: isOpen ? BRAND : '#4b5563', fontSize:18, flexShrink:0, transition:'transform 0.2s',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>›</div>
                </div>

                {/* Panel expandido */}
                {isOpen && (
                  <div style={{ borderTop:'1px solid #1a2e00', padding:16 }}>

                    {/* Lista de gastos existentes */}
                    {gList.length > 0 && (
                      <div className="mb-4 overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
                        <table className="dark-table">
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Concepto</th>
                              <th>Proveedor</th>
                              <th>Monto</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {gList.map(g => (
                              <tr key={g.id}>
                                {editGasto?.id === g.id ? (
                                  <>
                                    <td><input type="date" className="input-dark text-xs" style={{ width:130, padding:'2px 6px' }}
                                      value={editGasto.fecha} onChange={e => setEditGasto(p => ({...p, fecha:e.target.value}))} /></td>
                                    <td><input className="input-dark text-xs" style={{ width:'100%', padding:'2px 6px' }}
                                      value={editGasto.concepto} onChange={e => setEditGasto(p => ({...p, concepto:e.target.value}))} /></td>
                                    <td><input className="input-dark text-xs" style={{ width:'100%', padding:'2px 6px' }}
                                      value={editGasto.proveedor||''} onChange={e => setEditGasto(p => ({...p, proveedor:e.target.value}))} /></td>
                                    <td><input className="input-dark text-xs" style={{ width:120, padding:'2px 6px' }}
                                      value={editGasto.monto} onChange={e => setEditGasto(p => ({...p, monto:e.target.value}))} /></td>
                                    <td>
                                      <div className="flex gap-1">
                                        <button onClick={() => guardarEdicion(c.id)} disabled={saving}
                                          className="text-xs px-2 py-0.5 rounded"
                                          style={{ background: BRAND, color:'#000', fontWeight:700 }}>
                                          {saving ? '...' : '✓'}
                                        </button>
                                        <button onClick={() => setEditGasto(null)}
                                          className="text-xs px-2 py-0.5 rounded text-gray-500">✕</button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="text-xs text-gray-400">{g.fecha ? g.fecha.slice(0,10).split('-').reverse().join('/') : '-'}</td>
                                    <td className="font-medium text-white text-xs">{g.concepto}</td>
                                    <td className="text-xs text-gray-400">{g.proveedor || '-'}</td>
                                    <td className="font-bold text-xs" style={{ color: BRAND }}>{fmt(g.monto)}</td>
                                    <td>
                                      <div className="flex gap-2">
                                        <button onClick={() => setEditGasto({...g})}
                                          className="text-xs text-gray-600 hover:text-gray-300">✏</button>
                                        <button onClick={() => eliminarGasto(c.id, g.id)}
                                          className="text-xs text-gray-600 hover:text-red-400">✕</button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                            <tr style={{ background:'#0a0a0a', borderTop:'1px solid #2a2a2a' }}>
                              <td colSpan={3} className="font-bold text-xs text-white">TOTAL</td>
                              <td className="font-black text-sm" style={{ color: BRAND }}>{fmt(total)}</td>
                              <td></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Formulario para agregar nuevo gasto */}
                    <div style={{ background:'#0f0f0f', border:'1px solid #2a2a2a', borderRadius:10, padding:14 }}>
                      <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND }}>
                        + Agregar gasto
                      </div>
                      <div className="grid gap-2" style={{ gridTemplateColumns:'1fr 1fr 1fr 1fr auto' }}>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Concepto *</div>
                          <input className="input-dark w-full" placeholder="ej. Meta Ads, Diseño..."
                            value={form.concepto} onChange={e => setForm(p => ({...p, concepto:e.target.value}))} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Proveedor</div>
                          <input className="input-dark w-full" placeholder="ej. Meta, Google..."
                            value={form.proveedor} onChange={e => setForm(p => ({...p, proveedor:e.target.value}))} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Monto * ($)</div>
                          <input className="input-dark w-full" placeholder="ej. 150000"
                            value={form.monto} onChange={e => setForm(p => ({...p, monto:e.target.value}))} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Fecha *</div>
                          <input type="date" className="input-dark w-full"
                            value={form.fecha} onChange={e => setForm(p => ({...p, fecha:e.target.value}))} />
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={() => guardarGasto(c.id)}
                            disabled={saving || !form.concepto || !form.monto || !form.fecha}
                            className="btn-primary"
                            style={{ opacity: (!form.concepto || !form.monto || !form.fecha) ? 0.5 : 1 }}>
                            {saving ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
