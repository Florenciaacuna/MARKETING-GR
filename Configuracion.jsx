import { useState, useEffect, useCallback } from 'react'
import { supabase, traerTodo } from '../lib/datos'
import { CATALOGOS } from '../lib/config'
import { Aviso, Cargando } from '../components/ui'

function Catalogo({ cat }) {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [nuevo, setNuevo] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [sinClas, setSinClas] = useState([])

  const cargar = useCallback(() => {
    traerTodo(() => supabase.from(cat.tabla).select('*').order(cat.orden), 10000).then(setFilas).catch(e => setError(e.message))
    if (cat.id === 'origenes') supabase.from('origenes_sin_clasificar').select('*').then(({ data }) => setSinClas(data || []))
  }, [cat])
  useEffect(() => { setFilas(null); setError(''); setMsg(''); setNuevo(null); cargar() }, [cargar])

  const claveDe = f => Object.fromEntries(cat.clave.map(k => [k, f[k]]))

  async function guardarCampo(f, campo, valor) {
    setMsg('')
    const v = valor === '' ? null : valor
    if (f[campo] === v) return
    const { error } = await supabase.from(cat.tabla).update({ [campo]: v }).match(claveDe(f))
    if (error) { setError(error.message); return }
    setError(''); setMsg('Guardado'); setFilas(rs => rs.map(r => r === f ? { ...r, [campo]: v } : r))
  }
  async function borrar(f) {
    if (!window.confirm('¿Borrar esta fila?')) return
    const { error } = await supabase.from(cat.tabla).delete().match(claveDe(f))
    if (error) setError(error.message); else { setMsg('Borrado'); cargar() }
  }
  async function agregar() {
    const fila = Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v !== '' && v != null))
    const { error } = await supabase.from(cat.tabla).insert(fila)
    if (error) setError(error.message); else { setError(''); setMsg('Agregado'); setNuevo(null); cargar() }
  }

  const visibles = (filas || []).filter(f => !buscar || cat.columnas.some(c => String(f[c.campo] ?? '').toLowerCase().includes(buscar.toLowerCase())))

  const celda = (f, c) => c.tipo === 'bool'
    ? <input type="checkbox" checked={!!f[c.campo]} onChange={e => guardarCampo(f, c.campo, e.target.checked)} />
    : c.opciones
      ? <select className="input-dark" value={f[c.campo] || ''} onChange={e => guardarCampo(f, c.campo, e.target.value)}>
          {!c.opciones.includes(f[c.campo]) && <option value={f[c.campo] || ''}>{f[c.campo] || '—'}</option>}
          {c.opciones.map(o => <option key={o}>{o}</option>)}
        </select>
      : <input className="input-dark" style={{ width: '100%', minWidth: 120 }} defaultValue={f[c.campo] ?? ''}
          onBlur={e => guardarCampo(f, c.campo, e.target.value)} />

  return (
    <div>
      <div style={{ marginBottom: 12 }}><Aviso>{cat.ayuda}</Aviso></div>
      {sinClas.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'rgba(240,160,48,.4)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f0a030', marginBottom: 6 }}>Valores que llegaron en los reportes y todavía no están en el catálogo</div>
          <div className="filter-bar">
            {sinClas.map(s => (
              <button key={s.fuente + s.valor_crudo} className="btn-ghost"
                onClick={() => setNuevo({ ...cat.nuevo, fuente: s.fuente, valor_crudo: s.valor_crudo, sub_origen: s.valor_crudo, grupo: '' })}>
                + {s.valor_crudo} <span style={{ opacity: .6 }}>({s.fuente} · {s.leads} leads)</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="filter-bar" style={{ marginBottom: 10 }}>
        <input className="input-dark" placeholder="Buscar…" value={buscar} onChange={e => setBuscar(e.target.value)} />
        <button className="btn-primary" onClick={() => setNuevo({ ...cat.nuevo })}>+ Agregar</button>
        {msg && <span style={{ fontSize: 11, color: '#B5E000' }}>{msg}</span>}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}

      {nuevo && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="filter-bar">
            {cat.columnas.map(c => c.tipo === 'bool'
              ? <label key={c.campo} style={{ fontSize: 12 }}><input type="checkbox" checked={!!nuevo[c.campo]} onChange={e => setNuevo(n => ({ ...n, [c.campo]: e.target.checked }))} /> {c.titulo}</label>
              : c.opciones
                ? <select key={c.campo} className="input-dark" value={nuevo[c.campo] || ''} onChange={e => setNuevo(n => ({ ...n, [c.campo]: e.target.value }))}>
                    <option value="">{c.titulo}…</option>{c.opciones.map(o => <option key={o}>{o}</option>)}</select>
                : <input key={c.campo} className="input-dark" placeholder={c.titulo} value={nuevo[c.campo] || ''} onChange={e => setNuevo(n => ({ ...n, [c.campo]: e.target.value }))} />)}
            <button className="btn-primary" onClick={agregar}>Guardar</button>
            <button className="btn-ghost" onClick={() => setNuevo(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {!filas ? <Cargando /> : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="dark-table">
            <thead><tr>{cat.columnas.map(c => <th key={c.campo}>{c.titulo}</th>)}<th></th></tr></thead>
            <tbody>
              {visibles.map((f, i) => (
                <tr key={cat.clave.map(k => f[k]).join('|') + i}>
                  {cat.columnas.map(c => <td key={c.campo}>{celda(f, c)}</td>)}
                  <td><button className="btn-ghost" onClick={() => borrar(f)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="filter-results" style={{ padding: 10 }}><span>{visibles.length}</span> filas</div>
        </div>
      )}
    </div>
  )
}

export default function Configuracion() {
  const [id, setId] = useState(CATALOGOS[0].id)
  const cat = CATALOGOS.find(c => c.id === id)
  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: 14 }}>
        {CATALOGOS.map(c => <button key={c.id} className={id === c.id ? 'btn-primary' : 'btn-ghost'} onClick={() => setId(c.id)}>{c.titulo}</button>)}
      </div>
      <Catalogo key={cat.id} cat={cat} />
    </div>
  )
}
