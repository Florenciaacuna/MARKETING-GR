import { useState, useEffect, useMemo } from 'react'
import { supabase, traerTodo, valoresUnicos } from '../lib/datos'
import { AGRUPACIONES_SEGUIMIENTO, ESTADOS } from '../lib/config'
import { Aviso, Cargando, Tarjeta } from '../components/ui'

const suma = (filas, campo) => filas.reduce((a, f) => a + (Number(f[campo]) || 0), 0)
const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : 0)

function Barra({ valor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
      <div style={{ flex: 1, height: 6, background: '#1e2d1a', borderRadius: 3 }}>
        <div style={{ width: `${Math.min(valor, 100)}%`, height: 6, background: valor >= 60 ? '#B5E000' : valor >= 35 ? '#f0a030' : '#ef5350', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, width: 38, textAlign: 'right' }}>{valor}%</span>
    </div>
  )
}

export default function Seguimiento() {
  const [datos, setDatos] = useState(null)
  const [digitales, setDigitales] = useState([])
  const [error, setError] = useState('')
  const [agrupar, setAgrupar] = useState('sucursal')
  const [mes, setMes] = useState('')

  useEffect(() => {
    Promise.all([
      traerTodo(() => supabase.from('seguimiento').select('*').order('mes')),
      traerTodo(() => supabase.from('preventas_estado').select('mes,sub_origen,pagina').eq('estado', 'digital').order('id')),
    ]).then(([s, d]) => { setDatos(s); setDigitales(d) }).catch(e => setError(e.message))
  }, [])

  const meses = useMemo(() => datos ? valoresUnicos(datos, 'mes') : [], [datos])
  const filtradas = useMemo(() => (datos || []).filter(f => !mes || f.mes === mes), [datos, mes])

  const grupos = useMemo(() => {
    const m = new Map()
    for (const f of filtradas) {
      const k = f[agrupar] || 'Sin dato'
      const g = m.get(k) || { clave: k, preventas: 0, digital: 0, presencial: 0, origen_no_registrado: 0, posibles: 0, sin_vinculo: 0 }
      for (const c of ['preventas', 'digital', 'presencial', 'origen_no_registrado', 'posibles', 'sin_vinculo']) g[c] += Number(f[c]) || 0
      m.set(k, g)
    }
    return [...m.values()].sort((a, b) => agrupar === 'mes' ? a.clave.localeCompare(b.clave) : b.preventas - a.preventas)
  }, [filtradas, agrupar])

  const subOrigenes = useMemo(() => {
    const m = new Map()
    digitales.filter(d => !mes || d.mes === mes).forEach(d => { const k = d.sub_origen || 'Sin dato'; m.set(k, (m.get(k) || 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [digitales, mes])

  if (error) return <Aviso tipo="error">{error}</Aviso>
  if (!datos) return <Cargando />

  const T = { pv: suma(filtradas, 'preventas'), dig: suma(filtradas, 'digital'), pres: suma(filtradas, 'presencial'),
    nr: suma(filtradas, 'origen_no_registrado'), pos: suma(filtradas, 'posibles'), sin: suma(filtradas, 'sin_vinculo') }

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <select className="input-dark" value={mes} onChange={e => setMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {meses.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div className="filter-sep" />
        <span style={{ fontSize: 11, color: '#7a9a72' }}>Agrupar por</span>
        {AGRUPACIONES_SEGUIMIENTO.map(a => (
          <button key={a.id} className={agrupar === a.id ? 'btn-primary' : 'btn-ghost'} onClick={() => setAgrupar(a.id)}>{a.titulo}</button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <Tarjeta titulo="% con origen digital" valor={`${pct(T.dig, T.pv)}%`} detalle={`${T.dig} de ${T.pv} preventas (sin internas)`} color="#B5E000" />
        <Tarjeta titulo={ESTADOS.presencial.label} valor={T.pres} detalle={`${pct(T.pres, T.pv)}%`} />
        <Tarjeta titulo={ESTADOS.no_registrado.label} valor={T.nr} detalle={`${pct(T.nr, T.pv)}%`} color="#f0a030" />
        <Tarjeta titulo="Sin vínculo / posibles" valor={T.sin + T.pos} detalle={`${T.sin} sin vínculo · ${T.pos} para confirmar`} color="#ef5350" />
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="dark-table">
          <thead><tr>
            <th>{AGRUPACIONES_SEGUIMIENTO.find(a => a.id === agrupar).titulo}</th><th>Preventas</th><th>Digital</th><th>Presencial</th>
            <th>De Paso ±3d</th><th>Posibles</th><th>Sin vínculo</th><th>% digital</th>
          </tr></thead>
          <tbody>
            {grupos.map(g => (
              <tr key={g.clave}>
                <td style={{ fontWeight: 600 }}>{g.clave}</td><td>{g.preventas}</td><td>{g.digital}</td><td>{g.presencial}</td>
                <td>{g.origen_no_registrado}</td><td>{g.posibles}</td><td>{g.sin_vinculo}</td><td><Barra valor={pct(g.digital, g.preventas)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-header" style={{ marginTop: 20 }}><h2>Ventas digitales por sub-origen</h2><span className="count-badge">{T.dig}</span></div>
      <div className="card">
        {subOrigenes.map(([nombre, n]) => (
          <div key={nombre} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <div style={{ width: 220, fontSize: 12 }}>{nombre}</div>
            <div style={{ flex: 1, height: 8, background: '#1e2d1a', borderRadius: 4 }}>
              <div style={{ width: `${pct(n, subOrigenes[0][1])}%`, height: 8, background: '#B5E000', borderRadius: 4 }} />
            </div>
            <div style={{ width: 70, fontSize: 12, textAlign: 'right' }}>{n} <span style={{ color: '#7a9a72' }}>({pct(n, T.dig)}%)</span></div>
          </div>
        ))}
        {!subOrigenes.length && <Cargando texto="Todavía no hay ventas digitales vinculadas." />}
      </div>
    </div>
  )
}
