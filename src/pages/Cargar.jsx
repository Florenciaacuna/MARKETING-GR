import { useState, useRef, useEffect } from 'react'
import { analizar, guardar, correrCruce, totales, TIPOS } from '../lib/cargar'
import { Aviso, Tarjeta } from '../components/ui'

export default function Cargar() {
  const [items, setItems] = useState([])        // archivos analizados
  const [over, setOver] = useState(false)
  const [estado, setEstado] = useState('')      // texto de avance
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [tot, setTot] = useState(null)
  const input = useRef()

  const refrescar = () => totales().then(setTot).catch(() => {})
  useEffect(() => { refrescar() }, [])

  async function agregar(files) {
    setError(''); setResultado(null)
    const nuevos = []
    for (const f of files) {
      setEstado(`Leyendo ${f.name}…`)
      try { nuevos.push(await analizar(f)) } catch (e) { nuevos.push({ file: f, tipo: null, filas: 0, registros: [], error: e.message }) }
    }
    setEstado('')
    setItems(v => [...v, ...nuevos])
  }

  async function procesar() {
    setTrabajando(true); setError(''); setResultado(null)
    try {
      // primero leads, al final preventas
      const orden = [...items].filter(i => i.tipo).sort((a, b) => (a.tipo === 'preventas') - (b.tipo === 'preventas'))
      for (const it of orden) {
        await guardar(it, (n, t) => setEstado(`Guardando ${it.file.name}: ${n.toLocaleString('es-AR')} de ${t.toLocaleString('es-AR')}`))
      }
      setEstado('Cruzando leads con preventas… (puede tardar unos segundos)')
      setResultado(await correrCruce())
      setItems([])
      refrescar()
    } catch (e) { setError(e.message) }
    setEstado(''); setTrabajando(false)
  }

  async function soloCruzar() {
    setTrabajando(true); setError(''); setResultado(null); setEstado('Cruzando leads con preventas…')
    try { setResultado(await correrCruce()) } catch (e) { setError(e.message) }
    setEstado(''); setTrabajando(false)
  }

  const validos = items.filter(i => i.tipo)
  const pct = resultado && resultado.preventas - resultado.internas > 0
    ? Math.round(1000 * resultado.vinculadas_digital / (resultado.preventas - resultado.internas)) / 10 : null

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Tarjeta titulo="Leads Celer" valor={tot ? tot.celer.toLocaleString('es-AR') : '…'} detalle="en la base" />
        <Tarjeta titulo="Leads Derivado" valor={tot ? tot.derivado.toLocaleString('es-AR') : '…'} detalle="en la base" />
        <Tarjeta titulo="Preventas" valor={tot ? tot.preventas.toLocaleString('es-AR') : '…'} detalle="en la base" />
      </div>

      <div className={`dropzone ${over ? 'active' : ''} ${items.length ? 'filled' : ''}`}
        onClick={() => input.current.click()}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); agregar([...e.dataTransfer.files]) }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Arrastrá acá los reportes o hacé clic para elegirlos</div>
        <div style={{ fontSize: 11, color: '#7a9a72', marginTop: 4 }}>Celer (Leads por Facilitadores) · Derivado · PV Vinculadas — se detecta solo cuál es cada uno. Podés subir varios a la vez.</div>
        <input ref={input} type="file" multiple accept=".xls,.xlsx,.csv,.txt" style={{ display: 'none' }}
          onChange={e => { agregar([...e.target.files]); e.target.value = '' }} />
      </div>

      {items.length > 0 && (
        <div className="card mt-4">
          <table className="dark-table">
            <thead><tr><th>Archivo</th><th>Reporte</th><th>Registros</th><th>Período</th><th></th></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>{it.file.name}</td>
                  <td>{it.tipo ? <span className="badge badge-green">{TIPOS[it.tipo].nombre}</span> : <span className="badge badge-red">{it.error}</span>}</td>
                  <td>{it.tipo ? `${it.registros.length.toLocaleString('es-AR')} de ${it.filas.toLocaleString('es-AR')} filas` : '—'}</td>
                  <td>{it.desde ? `${it.desde} → ${it.hasta}` : '—'}</td>
                  <td><button className="btn-ghost" disabled={trabajando} onClick={() => setItems(v => v.filter((_, j) => j !== i))}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="filter-bar mt-3">
            <button className="btn-primary" disabled={trabajando || !validos.length} onClick={procesar}>Cargar y cruzar</button>
            <span style={{ fontSize: 11, color: '#7a9a72' }}>Si un registro ya estaba cargado, se actualiza (no se duplica). Los vínculos confirmados o rechazados a mano no se tocan.</span>
          </div>
        </div>
      )}

      {estado && <div className="mt-4"><Aviso>{estado}</Aviso></div>}
      {error && <div className="mt-4"><Aviso tipo="error">{error}</Aviso></div>}

      {resultado && (
        <div className="mt-4">
          <Aviso tipo="ok">Cruce terminado. {pct != null && <>El <b>{pct}%</b> de las preventas (sin contar las internas) tiene un lead digital identificado.</>}</Aviso>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Tarjeta titulo="Preventas" valor={resultado.preventas} detalle={`${resultado.internas} internas excluidas`} />
            <Tarjeta titulo="Con lead digital" valor={resultado.vinculadas_digital} color="#B5E000" />
            <Tarjeta titulo="Con algún vínculo" valor={resultado.vinculadas} />
            <Tarjeta titulo="Para confirmar" valor={resultado.posibles} color="#f0a030" detalle="ver pestaña Confirmar" />
            <Tarjeta titulo="Sin vínculo" valor={resultado.sin_vinculo} color="#ef5350" />
          </div>
        </div>
      )}

      <div className="mt-6">
        <button className="btn-ghost" disabled={trabajando} onClick={soloCruzar}>Volver a cruzar sin cargar archivos</button>
        <span style={{ fontSize: 11, color: '#3a5230', marginLeft: 8 }}>Útil después de corregir el catálogo de vendedores.</span>
      </div>
    </div>
  )
}
