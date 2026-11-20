import { useState, useEffect, useCallback } from 'react'
import { supabase, traerTodo } from '../lib/datos'
import { Aviso, Cargando, fmtFecha, usuarioDe } from '../components/ui'

const unir = v => (Array.isArray(v) && v.length ? v.join(', ') : '—')

export default function Confirmar({ session }) {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const usuario = usuarioDe(session)

  const cargar = useCallback(() =>
    traerTodo(() => supabase.from('vinculos_a_revisar').select('*').order('fecha_preventa', { ascending: false }).order('vinculo_id'), 3000)
      .then(setFilas).catch(e => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])

  async function decidir(fn, f) {
    setOcupado(f.vinculo_id); setError('')
    const { error } = await supabase.rpc(fn, { p_vinculo: f.vinculo_id, p_usuario: usuario })
    if (error) setError(error.message)
    else setFilas(v => v.filter(x => x.vinculo_id !== f.vinculo_id))
    setOcupado(null)
  }

  if (!filas) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Aviso>Estos vínculos son <b>posibles</b>: el sistema encontró algo en común pero no está seguro. Si confirmás, queda fijo y cuenta como origen de la venta; si rechazás, no se vuelve a proponer.</Aviso>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="section-header"><h2>Para revisar</h2><span className="count-badge">{filas.length}</span></div>
      {!filas.length && <Aviso tipo="ok">No hay vínculos pendientes de confirmar.</Aviso>}
      {filas.map(f => (
        <div key={f.vinculo_id} className="card" style={{ marginBottom: 10 }}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#7a9a72', letterSpacing: '.08em' }}>PREVENTA {f.pv} · {f.marca}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{f.cliente}</div>
              <div style={{ fontSize: 11, color: '#7a9a72' }}>{fmtFecha(f.fecha_preventa)} · {f.vendedor || 'sin vendedor'}</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>DNI {f.dni || '—'} · Tel {unir(f.tels_preventa)} · {f.email_preventa || 'sin email'}</div>
              {f.conyuge && <div style={{ fontSize: 11 }}>Cónyuge: {f.conyuge}</div>}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#B5E000', letterSpacing: '.08em' }}>LEAD {String(f.fuente).toUpperCase()} · regla: {f.regla}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{f.nombre_lead || 'sin nombre'}</div>
              <div style={{ fontSize: 11, color: '#7a9a72' }}>{fmtFecha(f.fecha_lead)} · {f.sub_origen} · {f.origen}</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>DNI {unir(f.dnis)} · Tel {unir(f.tels_lead)} · {unir(f.emails_lead)}</div>
            </div>
          </div>
          <div className="filter-bar mt-3">
            <button className="btn-primary" disabled={ocupado === f.vinculo_id} onClick={() => decidir('confirmar_vinculo', f)}>Es el mismo cliente</button>
            <button className="btn-ghost" disabled={ocupado === f.vinculo_id} onClick={() => decidir('rechazar_vinculo', f)}>No es</button>
          </div>
        </div>
      ))}
    </div>
  )
}
