import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase, traerTodo, valoresUnicos, limpiarBusqueda } from '../lib/datos'
import { PESTANAS_VINCULOS, COLUMNAS_VINCULOS, FILTROS_VINCULOS, POR_PAGINA } from '../lib/config'
import { EstadoBadge, Paginador, Cargando, Aviso, fmtFecha, usuarioDe } from '../components/ui'

const LS = 'gr_cols_vinculos'
const leerCols = () => { try { return JSON.parse(localStorage.getItem(LS)) } catch { return null } }

export default function Vinculos({ session }) {
  const [pestana, setPestana] = useState('todas')
  const [filtros, setFiltros] = useState({})
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [filas, setFilas] = useState([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [opciones, setOpciones] = useState({})
  const [conteos, setConteos] = useState({})
  const [visibles, setVisibles] = useState(() => leerCols() || COLUMNAS_VINCULOS.filter(c => c.visible).map(c => c.campo))
  const [verCols, setVerCols] = useState(false)
  const [abierta, setAbierta] = useState(null)
  const [version, setVersion] = useState(0)

  const columnas = COLUMNAS_VINCULOS.filter(c => visibles.includes(c.campo))

  // opciones de los filtros y conteo por estado (una sola vez, y al recargar)
  useEffect(() => {
    const campos = [...FILTROS_VINCULOS.map(f => f.campo), 'estado']
    traerTodo(() => supabase.from('preventas_estado').select(campos.join(',')).order('id'))
      .then(rows => {
        const o = {}; FILTROS_VINCULOS.forEach(f => { o[f.campo] = valoresUnicos(rows, f.campo) })
        setOpciones(o)
        const c = { todas: rows.length }; rows.forEach(r => { c[r.estado] = (c[r.estado] || 0) + 1 })
        setConteos(c)
      }).catch(e => setError(e.message))
  }, [version])

  const aplicar = useCallback(q => {
    const est = PESTANAS_VINCULOS.find(p => p.id === pestana)?.estados
    if (est) q = q.in('estado', est)
    for (const [campo, v] of Object.entries(filtros)) if (v) q = q.eq(campo, v)
    const b = limpiarBusqueda(busqueda)
    if (b) q = q.or(`nombre.ilike.%${b}%,pv.ilike.%${b}%,dni.ilike.%${b}%,vendedor.ilike.%${b}%`)
    return q
  }, [pestana, filtros, busqueda])

  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    const t = setTimeout(async () => {
      const { data, count, error } = await aplicar(supabase.from('preventas_estado').select('*', { count: 'exact' }))
        .order('fecha', { ascending: false }).order('id').range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
      if (!vivo) return
      if (error) setError(error.message); else { setFilas(data); setTotal(count ?? 0) }
      setCargando(false)
    }, busqueda ? 300 : 0)
    return () => { vivo = false; clearTimeout(t) }
  }, [aplicar, pagina, version])

  const cambiar = fn => { fn(); setPagina(1) }

  async function exportar() {
    const rows = await traerTodo(() => aplicar(supabase.from('preventas_estado').select('*')).order('fecha', { ascending: false }).order('id'))
    const hoja = rows.map(r => Object.fromEntries(columnas.map(c => [c.titulo, c.tipo === 'fecha' ? fmtFecha(r[c.campo]) : r[c.campo]])))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja), 'Vínculos')
    XLSX.writeFile(wb, `vinculos_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const toggleCol = campo => setVisibles(v => {
    const n = v.includes(campo) ? v.filter(x => x !== campo) : [...v, campo]
    try { localStorage.setItem(LS, JSON.stringify(n)) } catch {}
    return n
  })

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        {PESTANAS_VINCULOS.map(p => (
          <button key={p.id} className={pestana === p.id ? 'btn-primary' : 'btn-ghost'}
            onClick={() => cambiar(() => setPestana(p.id))}>
            {p.label} <span style={{ opacity: .7, marginLeft: 4 }}>{conteos[p.id] ?? (p.estados ? conteos[p.estados[0]] : '') ?? ''}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <input className="input-dark" style={{ width: 220 }} placeholder="Buscar cliente, PV, DNI, vendedor…" value={busqueda}
          onChange={e => cambiar(() => setBusqueda(e.target.value))} />
        {FILTROS_VINCULOS.map(f => (
          <select key={f.campo} className="input-dark" value={filtros[f.campo] || ''}
            onChange={e => cambiar(() => setFiltros(v => ({ ...v, [f.campo]: e.target.value })))}>
            <option value="">{f.titulo}: todos</option>
            {(opciones[f.campo] || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <div className="filter-sep" />
        <button className="btn-ghost" onClick={() => setVerCols(v => !v)}>Columnas</button>
        <button className="btn-ghost" onClick={exportar}>Exportar Excel</button>
        <button className="btn-ghost" onClick={() => setVersion(v => v + 1)}>Actualizar</button>
      </div>

      {verCols && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="filter-bar">
            {COLUMNAS_VINCULOS.map(c => (
              <label key={c.campo} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={visibles.includes(c.campo)} onChange={() => toggleCol(c.campo)} /> {c.titulo}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="dark-table">
          <thead><tr>{columnas.map(c => <th key={c.campo}>{c.titulo}</th>)}</tr></thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => setAbierta(f)}>
                {columnas.map(c => (
                  <td key={c.campo}>
                    {c.tipo === 'estado' ? <EstadoBadge estado={f.estado} />
                      : c.tipo === 'fecha' ? fmtFecha(f[c.campo])
                      : (f[c.campo] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {cargando && <Cargando />}
        {!cargando && !filas.length && !error && <Cargando texto="No hay preventas con estos filtros." />}
      </div>
      <Paginador pagina={pagina} total={total} porPagina={POR_PAGINA} onCambiar={setPagina} />

      {abierta && <Detalle preventa={abierta} usuario={usuarioDe(session)}
        onCerrar={() => setAbierta(null)} onCambio={() => setVersion(v => v + 1)} />}
    </div>
  )
}

// ── Panel lateral: todos los leads vinculados a una preventa ─────────
export function Detalle({ preventa: p, usuario, onCerrar, onCambio }) {
  const [vincs, setVincs] = useState(null)
  const [msg, setMsg] = useState('')
  const [leadManual, setLeadManual] = useState('')
  const [tramite, setTramite] = useState(p.tramite_declarado || '')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('vinculos_todos').select('*').eq('preventa_id', p.id)
      .order('es_principal', { ascending: false }).order('fecha_lead', { ascending: false })
    if (error) setMsg(error.message); else setVincs(data)
  }, [p.id])
  useEffect(() => { cargar() }, [cargar])

  async function llamar(fn, args, ok) {
    setMsg('')
    const { data, error } = await supabase.rpc(fn, args)
    if (error) { setMsg(error.message); return }
    setMsg(typeof ok === 'function' ? ok(data) : ok); await cargar(); onCambio()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }} onClick={onCerrar}>
      <div style={{ width: 560, maxWidth: '100%', background: '#0d1a0d', borderLeft: '1px solid #253320', overflowY: 'auto', padding: 20 }} onClick={e => e.stopPropagation()}>
        <div className="filter-bar" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{p.nombre || 'Sin nombre'}</div>
            <div style={{ fontSize: 11, color: '#7a9a72' }}>PV {p.pv} · {p.marca} · {fmtFecha(p.fecha)} · {p.vendedor || 'sin vendedor'} · {p.sucursal}</div>
          </div>
          <button className="btn-ghost" onClick={onCerrar}>Cerrar</button>
        </div>
        <div style={{ margin: '10px 0' }}><EstadoBadge estado={p.estado} /></div>
        <div style={{ fontSize: 11, color: '#7a9a72', marginBottom: 12 }}>
          DNI {p.dni || '—'} · Tel {(p.tels || []).join(', ') || '—'} · {p.email || 'sin email'}{p.conyuge ? ` · Cónyuge: ${p.conyuge}` : ''}
        </div>

        <div className="section-header"><h2>Leads vinculados</h2><span className="count-badge">{vincs?.length ?? '…'}</span></div>
        {!vincs ? <Cargando /> : !vincs.length ? <Aviso>Esta preventa no tiene leads vinculados.</Aviso> : vincs.map(v => (
          <div key={v.vinculo_id} className="card" style={{ marginBottom: 8, borderColor: v.es_principal ? 'rgba(181,224,0,.5)' : undefined }}>
            <div className="filter-bar" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                {v.sub_origen} <span style={{ color: '#7a9a72', fontWeight: 400 }}>· {v.origen} · {v.fuente}</span>
              </div>
              <div>
                {v.es_principal && <span className="badge badge-green" style={{ marginRight: 4 }}>Principal</span>}
                <span className={`badge ${v.nivel === 'seguro' ? 'badge-green' : v.nivel === 'probable' ? 'badge-blue' : 'badge-yellow'}`}>{v.nivel}</span>
                <span className={`badge ${v.estado === 'confirmado' ? 'badge-green' : v.estado === 'rechazado' ? 'badge-red' : 'badge-gray'}`} style={{ marginLeft: 4 }}>{v.estado}</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#7a9a72', marginTop: 4 }}>
              {v.nombre_lead || 'sin nombre'} · {fmtFecha(v.fecha_lead)} · regla: {v.regla} · trámite {v.tramite || '—'}
              {v.pagina ? ` · ${v.pagina}` : ''}{v.vendedor_lead ? ` · vendedor ${v.vendedor_lead}` : ''}
            </div>
            <div className="filter-bar" style={{ marginTop: 8 }}>
              {v.estado !== 'confirmado' && <button className="btn-primary" onClick={() => llamar('confirmar_vinculo', { p_vinculo: v.vinculo_id, p_usuario: usuario }, 'Vínculo confirmado')}>Confirmar</button>}
              {v.estado !== 'rechazado' && <button className="btn-ghost" onClick={() => llamar('rechazar_vinculo', { p_vinculo: v.vinculo_id, p_usuario: usuario }, 'Vínculo rechazado')}>Rechazar</button>}
            </div>
          </div>
        ))}

        <div className="section-header" style={{ marginTop: 16 }}><h2>Vincular a mano</h2></div>
        <div className="filter-bar">
          <input className="input-dark" placeholder="Nº de lead (id interno)" value={leadManual} onChange={e => setLeadManual(e.target.value)} />
          <button className="btn-ghost" disabled={!leadManual} onClick={() => llamar('vincular_manual', { p_preventa: p.id, p_lead: Number(leadManual), p_usuario: usuario }, 'Vinculado')}>Vincular</button>
        </div>
        <div className="section-header" style={{ marginTop: 16 }}><h2>Declarar Nº de trámite</h2></div>
        <div className="filter-bar">
          <input className="input-dark" placeholder="Nº de trámite del lead" value={tramite} onChange={e => setTramite(e.target.value)} />
          <button className="btn-ghost" disabled={!tramite} onClick={() => llamar('declarar_tramite', { p_preventa: p.id, p_tramite: tramite, p_usuario: usuario },
            n => n > 0 ? `Trámite encontrado y vinculado (${n})` : 'Trámite guardado, pero ese trámite todavía no está cargado')}>Declarar</button>
        </div>
        {msg && <div style={{ marginTop: 12 }}><Aviso>{msg}</Aviso></div>}
      </div>
    </div>
  )
}
