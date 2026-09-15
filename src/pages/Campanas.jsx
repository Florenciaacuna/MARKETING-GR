import PencilIcon from '../components/PencilIcon'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const BRAND = '#B5E000'
const fmt   = n => (n||0).toLocaleString('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 })
const fmtN  = n => (n||0).toLocaleString('es-AR')
const pct   = (a,b) => b > 0 ? (a*100/b).toFixed(1)+'%' : '—'
const today = () => new Date().toISOString().slice(0,10)
const emptyForm = { concepto:'', monto:'', fecha: today(), proveedor:'' }

const RUBROS = ['0KM','PDA','USADOS','V.E','COMPRA','POSTVENTA']
const MARCAS = ['KIARA','CIARA','PEARA','GRUPO','SELECCIÓN','LA FÁBRICA','CHERY','RENAULT']

export default function Campanas() {
  const [campanas,    setCampanas]    = useState([])
  const [stats,       setStats]       = useState({})   // { campana_id: { leads, ventas, gasto } }
  const [gastos,      setGastos]      = useState({})   // { campana_id: [...] }
  const [expanded,    setExpanded]    = useState(null)
  const [form,        setForm]        = useState(emptyForm)
  const [saving,      setSaving]      = useState(false)
  const [editGasto,   setEditGasto]   = useState(null)
  const [search,      setSearch]      = useState('')
  const [filtroMarca, setFiltroMarca] = useState('')
  const [filtroRubro, setFiltroRubro] = useState('')
  const [loading,     setLoading]     = useState(true)
  const [kpis,        setKpis]        = useState(null)

  useEffect(() => { loadAll() }, [])

  async function fetchAll(table, selectStr, notNullCol = null, filters = []) {
    const PAGE = 1000; let all = [], from = 0
    while (true) {
      let q = supabase.from(table).select(selectStr).range(from, from + PAGE - 1)
      if (notNullCol) q = q.not(notNullCol, 'is', null)
      filters.forEach(f => { q = f(q) })
      const { data, error } = await q
      if (error || !data?.length) break
      all = all.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }
    return all
  }

  async function loadAll() {
    setLoading(true)

    // Cargar campañas
    const { data: camps } = await supabase
      .from('mkt_campanas')
      .select('id,codigo,nombre,marca,rubro,activo,ingreso_manual')
      .order('marca').order('nombre')
    setCampanas(camps || [])

    if (!camps?.length) { setLoading(false); return }

    // Leads, ventas y gastos paginados — superan límite de 1000 filas de Supabase
    const [leadsData, ventasData, gastosData] = await Promise.all([
      fetchAll('mkt_leads',  'campana_id,fuente',          'campana_id'),
      fetchAll('mkt_ventas', 'campana_id,resultado_bruto,gestoria', 'campana_id'),
      fetchAll('mkt_gastos', 'campana_id,monto',           null)
    ])

    // Agrupar en JS
    const map = {}
    const init = id => { if (!map[id]) map[id] = { leads:0, ventas:0, gasto:0 } }

    leadsData?.forEach(l => {
      init(l.campana_id)
      map[l.campana_id].leads++
      if (l.fuente === 'manual') map[l.campana_id].leadsEvento = (map[l.campana_id].leadsEvento||0)+1
      else map[l.campana_id].leadsDigital = (map[l.campana_id].leadsDigital||0)+1
    })
    ventasData?.forEach(v => {
      init(v.campana_id)
      map[v.campana_id].ventas++
      map[v.campana_id].resultado   = (map[v.campana_id].resultado||0)   + (v.resultado_bruto||0)
      map[v.campana_id].gestoria    = (map[v.campana_id].gestoria||0)    + (v.gestoria||0)
      map[v.campana_id].conGestoria = (map[v.campana_id].conGestoria||0) + (v.resultado_bruto||0) + (v.gestoria||0)
    })
    gastosData?.forEach(g => { init(g.campana_id); map[g.campana_id].gasto += (g.monto||0) })

    setStats(map)

    // KPIs globales
    const totalInversion = gastosData?.reduce((s,g) => s+(g.monto||0), 0) || 0
    const totalLeads     = leadsData?.length || 0
    const totalVentas    = ventasData?.length || 0
    const costoLead      = totalLeads  > 0 ? totalInversion / totalLeads  : 0
    const costoVenta     = totalVentas > 0 ? totalInversion / totalVentas : 0
    const conv           = totalLeads  > 0 ? totalVentas / totalLeads * 100 : 0

    // ROI global (si hay ingresos manuales cargados)
    const totalIngresos = camps?.reduce((s,c) => s+(c.ingreso_manual||0), 0) || 0
    const roi = totalInversion > 0 && totalIngresos > 0
      ? ((totalIngresos - totalInversion) / totalInversion * 100).toFixed(1)
      : null

    setKpis({ totalInversion, totalLeads, totalVentas, costoLead, costoVenta, conv, roi, totalIngresos })
    setLoading(false)
  }

  const [preventas, setPreventas] = useState({}) // { campana_id: [...] }

  async function loadGastos(campanaId) {
    const { data } = await supabase
      .from('mkt_gastos')
      .select('id,concepto,monto,fecha,proveedor')
      .eq('campana_id', campanaId)
      .order('fecha', { ascending: false })
    setGastos(prev => ({ ...prev, [campanaId]: data || [] }))
  }

  async function loadPreventas(campanaId) {
    const { data } = await supabase
      .from('mkt_ventas')
      .select('id,pv_solicitud,fecha,nombre,dni,vendedor,marca,metodo_match,margen_bruto,bonificacion_terminal,resultado_bruto,gestoria')
      .eq('campana_id', campanaId)
      .order('fecha', { ascending: false })
    setPreventas(prev => ({ ...prev, [campanaId]: data || [] }))
  }

  function toggle(id) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id); setForm(emptyForm); setEditGasto(null)
    if (!gastos[id])    loadGastos(id)
    if (!preventas[id]) loadPreventas(id)
  }

  async function guardarGasto(campanaId) {
    if (!form.concepto || !form.monto || !form.fecha) return
    setSaving(true)
    const monto = parseFloat(String(form.monto).replace(/\./g,'').replace(',','.'))
    await supabase.from('mkt_gastos').insert({
      campana_id: campanaId, concepto: form.concepto.trim(),
      monto, fecha: form.fecha, proveedor: form.proveedor.trim() || null
    })
    setForm(emptyForm)
    await loadGastos(campanaId)
    // Actualizar stats
    setStats(prev => ({
      ...prev,
      [campanaId]: { ...prev[campanaId], gasto: (prev[campanaId]?.gasto||0) + monto }
    }))
    setSaving(false)
  }

  async function eliminarGasto(campanaId, gastoId, monto) {
    if (!confirm('¿Eliminar este gasto?')) return
    await supabase.from('mkt_gastos').delete().eq('id', gastoId)
    await loadGastos(campanaId)
    setStats(prev => ({
      ...prev,
      [campanaId]: { ...prev[campanaId], gasto: (prev[campanaId]?.gasto||0) - monto }
    }))
  }

  async function guardarEdicion(campanaId) {
    if (!editGasto) return
    setSaving(true)
    const monto = parseFloat(String(editGasto.monto).replace(/\./g,'').replace(',','.'))
    await supabase.from('mkt_gastos').update({
      concepto: editGasto.concepto, monto, fecha: editGasto.fecha, proveedor: editGasto.proveedor||null
    }).eq('id', editGasto.id)
    setEditGasto(null)
    await loadGastos(campanaId)
    setSaving(false)
  }

  const filtered = campanas.filter(c => {
    if (filtroMarca && c.marca !== filtroMarca) return false
    if (filtroRubro && c.rubro !== filtroRubro) return false
    if (search && !c.nombre.toLowerCase().includes(search.toLowerCase()) &&
        !(c.codigo||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-4">

      {/* KPIs */}
      {kpis && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {[
            { label:'INVERSIÓN TOTAL', value: fmt(kpis.totalInversion), accent:false },
            { label:'LEADS',           value: fmtN(kpis.totalLeads),     accent:false },
            { label:'PREVENTAS',       value: fmtN(kpis.totalVentas),    accent:true  },
            { label:'CONVERSIÓN',      value: pct(kpis.totalVentas, kpis.totalLeads), accent:false },
            {
              label: 'ROI',
              value: kpis.roi !== null ? kpis.roi+'%' : '—',
              accent: kpis.roi !== null && parseFloat(kpis.roi) > 0,
              roi: true
            },
          ].map(k => (
            <div key={k.label} className="rounded-xl p-3 border"
              style={{ background: k.accent ? '#1a2e00' : '#111', borderColor: k.accent ? BRAND : '#2a2a2a' }}>
              <div className="text-lg font-black" style={{ color: k.accent ? BRAND : k.roi && parseFloat(k.value) > 0 ? BRAND : k.roi ? '#ef4444' : '#fff' }}>
                {loading ? '—' : k.value}
              </div>
              <div className="text-xs font-bold uppercase tracking-wider mt-0.5"
                style={{ color: k.accent ? BRAND : '#4b5563' }}>{k.label}</div>
              {k.roi && kpis.roi === null && (
                <div className="text-xs mt-0.5" style={{ color:'#374151' }}>
                  Cargá ingresos para ver ROI
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* FILTROS */}
      <div className="card">
        <div className="filter-bar" style={{ marginBottom:8 }}>
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
        <div className="filter-results">
          Mostrando <span>{filtered.length}</span> de {campanas.length} campañas
        </div>
      </div>

      {/* LISTA */}
      {loading ? (
        <div className="card text-center text-gray-500 text-xs py-8">Cargando campañas...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const s      = stats[c.id] || { leads:0, ventas:0, gasto:0 }
            const gList  = gastos[c.id] || []
            const isOpen = expanded === c.id
            const cpl    = s.leads  > 0 ? s.gasto / s.leads  : 0
            const cpv    = s.ventas > 0 ? s.gasto / s.ventas : 0


            return (
              <div key={c.id} className="card" style={{ padding:0, overflow:'hidden' }}>

                {/* HEADER */}
                <div className="cursor-pointer px-4 py-3 flex items-center gap-4"
                  style={{ background: isOpen ? '#1a2e00' : '#111', transition:'background 0.15s', minHeight:72 }}
                  onClick={() => toggle(c.id)}>


                  {/* Nombre y badges */}
                  <div style={{ flex:'0 0 220px', minWidth:0 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{c.nombre}</span>
                      {c.codigo && (
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                          style={{ background:'#2a3d00', color: BRAND }}>[{c.codigo}]</span>
                      )}
                      {!c.activo && <span className="badge badge-gray text-xs">Inactiva</span>}
                    </div>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-xs" style={{ color:'#6b7280' }}>{c.marca}</span>
                      {c.rubro && <span className="badge badge-gray" style={{ fontSize:'0.6rem' }}>{c.rubro}</span>}
                    </div>
                  </div>

                  {/* Métricas en línea */}
                  <div className="flex gap-6 flex-1">

                    <div className="text-center px-2">
                      <div className="text-xl font-black text-white">{fmtN(s.leadsDigital||s.leads)}</div>
                      <div className="text-xs mt-0.5" style={{ color:'#4b5563' }}>LEADS DIGITAL</div>
                      {s.leadsEvento > 0 && (
                        <div className="text-xs" style={{ color:'#374151' }}>+{fmtN(s.leadsEvento)} evento</div>
                      )}
                    </div>

                    <div className="text-center px-2">
                      <div className="text-xl font-black" style={{ color: BRAND }}>{fmtN(s.ventas)}</div>
                      <div className="text-xs mt-0.5" style={{ color:'#4b5563' }}>PREVENTAS</div>
                    </div>

                    <div className="text-center px-2">
                      <div className="text-xl font-black text-white">{pct(s.ventas, s.leads)}</div>
                      <div className="text-xs mt-0.5" style={{ color:'#4b5563' }}>CONV.</div>
                    </div>

                    <div className="text-center px-2">
                      <div className="text-xl font-black text-white">
                        {s.gasto > 0 ? fmt(s.gasto) : <span style={{ color:'#4b5563' }}>—</span>}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color:'#4b5563' }}>INVERTIDO</div>
                    </div>

                    <div className="text-center px-2">
                      {s.gasto > 0 ? (
                        <div className="flex gap-4 items-center">
                          {s.resultado > 0 && (
                            <div className="text-center">
                              <div className="text-xl font-black" style={{ color:'#9ca3af' }}>
                                {((s.resultado - s.gasto)/s.gasto*100).toFixed(1)}%
                              </div>
                              <div className="text-xs font-bold uppercase mt-0.5" style={{ color:'#4b5563' }}>S/GEST</div>
                            </div>
                          )}
                          {s.conGestoria > 0 && (
                            <div className="text-center">
                              <div className="text-2xl font-black" style={{ color: s.conGestoria > s.gasto ? BRAND : '#ef4444' }}>
                                {((s.conGestoria - s.gasto)/s.gasto*100).toFixed(1)}%
                              </div>
                              <div className="text-xs font-bold uppercase mt-0.5" style={{ color:'#4b5563' }}>C/GEST</div>
                            </div>
                          )}
                          {!s.conGestoria && !s.resultado && (
                            <div className="text-center">
                              <div className="text-2xl font-black" style={{ color:'#4b5563' }}>—</div>
                              <div className="text-xs font-bold uppercase mt-0.5" style={{ color:'#374151' }}>ROI</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="text-xl font-black" style={{ color:'#4b5563' }}>—</div>
                          <div className="text-xs mt-0.5 font-bold uppercase" style={{ color:'#374151' }}>ROI</div>
                        </div>
                      )}
                    </div>

                  </div>

                  <div style={{ color: isOpen ? BRAND : '#4b5563', fontSize:18, flexShrink:0,
                    transition:'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</div>
                </div>

                {/* PANEL EXPANDIDO */}
                {isOpen && (
                  <div style={{ borderTop:'1px solid #1a2e00', padding:16 }}>

                    {/* TABLA DE PREVENTAS */}
                    {(() => {
                      const pvList = preventas[c.id] || []
                      const totalResultado = pvList.reduce((s,v) => s+(v.resultado_bruto||0), 0)
                      const totalBonif     = pvList.reduce((s,v) => s+(v.bonificacion_terminal||0), 0)
                      const inversion      = s.gasto
                      const roi            = inversion > 0 && totalResultado > 0
                        ? ((totalResultado - inversion) / inversion * 100).toFixed(1)
                        : null

                      return (
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND }}>
                              Preventas vinculadas — {pvList.length}
                            </div>
                            {(() => {
                                const totalGest = pvList.reduce((s,v)=>s+(v.gestoria||0),0)
                                const totalConG = totalResultado + totalGest
                                const roiConG = inversion > 0 && totalConG > 0 ? ((totalConG-inversion)/inversion*100).toFixed(1) : null
                                return (
                                  <div className="flex items-center gap-3 flex-wrap">
                                    {roi && <span className="text-xs text-gray-500">S/gest: <span className="font-bold" style={{ color:'#9ca3af' }}>{roi}%</span></span>}
                                    {roiConG && (
                                      <span className="text-xs font-black px-3 py-1 rounded-lg"
                                        style={{ background: parseFloat(roiConG)>0?'#1a2e00':'#2e0000', color: parseFloat(roiConG)>0?BRAND:'#ef4444' }}>
                                        ROI c/gest: {roiConG}%
                                      </span>
                                    )}
                                    {totalGest > 0 && <span className="text-xs text-gray-500">Gest: <span className="font-bold text-white">{fmt(totalGest)}</span></span>}
                                  </div>
                                )
                              })()}
                          </div>
                          {pvList.length > 0 ? (
                            <div className="overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
                              <table className="dark-table">
                                <thead>
                                  <tr>
                                    <th>PV</th>
                                    <th>Fecha</th>
                                    <th>Cliente</th>
                                    <th>Vendedor</th>
                                    <th>Match</th>
                                    <th>Margen Bruto</th>
                                    <th>Bonif. Terminal</th>
                                    <th>Result. Bruto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pvList.map(v => (
                                    <tr key={v.id}>
                                      <td className="font-mono text-xs" style={{ color: BRAND }}>{v.pv_solicitud}</td>
                                      <td className="text-xs text-gray-400">{v.fecha ? v.fecha.slice(0,10).split('-').reverse().join('/') : '-'}</td>
                                      <td className="font-medium text-white text-xs">{v.nombre}</td>
                                      <td className="text-xs text-gray-400">{v.vendedor||'-'}</td>
                                      <td>
                                        {v.metodo_match
                                          ? <span className="badge badge-green text-xs">{v.metodo_match}</span>
                                          : <span className="text-gray-600 text-xs">—</span>}
                                      </td>
                                      <td className="text-xs font-mono"
                                        style={{ color: (v.margen_bruto||0)<0?'#ef4444':'#22c55e' }}>
                                        {v.margen_bruto!=null ? fmt(v.margen_bruto) : '—'}
                                      </td>
                                      <td className="text-xs font-mono text-white">
                                        {v.bonificacion_terminal!=null ? fmt(v.bonificacion_terminal) : '—'}
                                      </td>
                                      <td className="text-sm font-black"
                                        style={{ color: (v.resultado_bruto||0)>=0?BRAND:'#ef4444' }}>
                                        {v.resultado_bruto!=null ? fmt(v.resultado_bruto) : '—'}
                                      </td>
                                      <td className="text-xs font-mono text-white">
                                        {v.gestoria ? fmt(v.gestoria) : '—'}
                                      </td>
                                      <td className="text-sm font-black" style={{ color: BRAND }}>
                                        {(v.resultado_bruto||v.gestoria) ? fmt((v.resultado_bruto||0)+(v.gestoria||0)) : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                  <tr style={{ background:'#0a0a0a', borderTop:'1px solid #2a2a2a' }}>
                                    <td colSpan={5} className="font-bold text-xs text-white">TOTAL</td>
                                    <td></td>
                                    <td className="font-bold text-xs text-white">{fmt(totalBonif)}</td>
                                    <td className="font-black text-sm" style={{ color: totalResultado>=0?BRAND:'#ef4444' }}>
                                      {fmt(totalResultado)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-xs p-3 rounded-lg" style={{ background:'#0f0f0f', color:'#4b5563' }}>
                              Sin preventas vinculadas a esta campaña.
                              Ejecutá el cruce en Asignados o vinculalas manualmente en Preventas.
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Lista gastos */}
                    {gList.length > 0 && (
                      <div className="mb-4 overflow-x-auto rounded-lg border" style={{ borderColor:'#2a2a2a' }}>
                        <table className="dark-table">
                          <thead>
                            <tr><th>Fecha</th><th>Concepto</th><th>Proveedor</th><th>Monto</th><th></th></tr>
                          </thead>
                          <tbody>
                            {gList.map(g => (
                              <tr key={g.id}>
                                {editGasto?.id === g.id ? (
                                  <>
                                    <td><input type="date" className="input-dark text-xs" style={{ width:130, padding:'2px 6px' }}
                                      value={editGasto.fecha} onChange={e => setEditGasto(p=>({...p,fecha:e.target.value}))} /></td>
                                    <td><input className="input-dark text-xs w-full" style={{ padding:'2px 6px' }}
                                      value={editGasto.concepto} onChange={e => setEditGasto(p=>({...p,concepto:e.target.value}))} /></td>
                                    <td><input className="input-dark text-xs w-full" style={{ padding:'2px 6px' }}
                                      value={editGasto.proveedor||''} onChange={e => setEditGasto(p=>({...p,proveedor:e.target.value}))} /></td>
                                    <td><input className="input-dark text-xs" style={{ width:120, padding:'2px 6px' }}
                                      value={editGasto.monto} onChange={e => setEditGasto(p=>({...p,monto:e.target.value}))} /></td>
                                    <td>
                                      <div className="flex gap-1">
                                        <button onClick={() => guardarEdicion(c.id)} disabled={saving}
                                          className="text-xs px-2 py-0.5 rounded"
                                          style={{ background: BRAND, color:'#000', fontWeight:700 }}>✓</button>
                                        <button onClick={() => setEditGasto(null)}
                                          className="text-xs px-2 py-0.5 rounded text-gray-500">✕</button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="text-xs text-gray-400">{g.fecha ? g.fecha.slice(0,10).split('-').reverse().join('/') : '-'}</td>
                                    <td className="font-medium text-white text-xs">{g.concepto}</td>
                                    <td className="text-xs text-gray-400">{g.proveedor||'-'}</td>
                                    <td className="font-bold text-xs" style={{ color: BRAND }}>{fmt(g.monto)}</td>
                                    <td>
                                      <div className="flex gap-2">
                                        <button onClick={() => setEditGasto({...g})} className="pencil-icon" title="Editar"><PencilIcon size={13} color="#888" /></button>
                                        <button onClick={() => eliminarGasto(c.id, g.id, g.monto)} className="text-xs text-gray-600 hover:text-red-400">✕</button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                            <tr style={{ background:'#0a0a0a', borderTop:'1px solid #2a2a2a' }}>
                              <td colSpan={3} className="font-bold text-xs text-white">TOTAL</td>
                              <td className="font-black text-sm" style={{ color: BRAND }}>{fmt(gList.reduce((s,g)=>s+(g.monto||0),0))}</td>
                              <td></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Formulario nuevo gasto */}
                    <div style={{ background:'#0f0f0f', border:'1px solid #2a2a2a', borderRadius:10, padding:14 }}>
                      <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND }}>+ Agregar gasto</div>
                      <div className="grid gap-2" style={{ gridTemplateColumns:'1fr 1fr 1fr 1fr auto' }}>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Concepto *</div>
                          <input className="input-dark w-full" placeholder="ej. Meta Ads..."
                            value={form.concepto} onChange={e => setForm(p=>({...p,concepto:e.target.value}))} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Proveedor</div>
                          <input className="input-dark w-full" placeholder="ej. Meta, Google..."
                            value={form.proveedor} onChange={e => setForm(p=>({...p,proveedor:e.target.value}))} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Monto * ($)</div>
                          <input className="input-dark w-full" placeholder="ej. 150000"
                            value={form.monto} onChange={e => setForm(p=>({...p,monto:e.target.value}))} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Fecha *</div>
                          <input type="date" className="input-dark w-full"
                            value={form.fecha} onChange={e => setForm(p=>({...p,fecha:e.target.value}))} />
                        </div>
                        <div className="flex items-end">
                          <button onClick={() => guardarGasto(c.id)} disabled={saving||!form.concepto||!form.monto||!form.fecha}
                            className="btn-primary" style={{ opacity:(!form.concepto||!form.monto||!form.fecha)?0.5:1 }}>
                            {saving?'...':'Guardar'}
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

// Editor inline de ingreso para ROI
function IngresoEditor({ campana, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [val,     setVal]     = useState(campana.ingreso_manual || '')
  const [saving,  setSaving]  = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('mkt_campanas').update({
      ingreso_manual: parseFloat(String(val).replace(/\./g,'').replace(',','.')) || null
    }).eq('id', campana.id)
    setSaving(false); setEditing(false); onUpdate()
  }

  const fmt = n => n ? (n).toLocaleString('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }) : null
  const display = fmt(campana.ingreso_manual)

  if (editing) return (
    <div className="flex items-center gap-2">
      <input className="input-dark text-xs" style={{ width:160, padding:'3px 8px' }}
        placeholder="ej. 5000000" value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && save()} autoFocus />
      <button onClick={save} disabled={saving}
        className="text-xs px-2 py-1 rounded font-bold"
        style={{ background: BRAND, color:'#000' }}>{saving?'...':'✓'}</button>
      <button onClick={() => setEditing(false)} className="text-xs text-gray-600">✕</button>
    </div>
  )

  return (
    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setEditing(true)}>
      {display
        ? <span className="text-sm font-bold" style={{ color: BRAND }}>{display}</span>
        : <span className="text-xs" style={{ color:'#4b5563' }}>— cargar ingreso para ver ROI</span>
      }
      <PencilIcon size={13} color="#555" />
    </div>
  )
}
