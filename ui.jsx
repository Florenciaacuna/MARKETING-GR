import { ESTADOS } from '../lib/config'

export const fmtFecha = v => {
  if (!v) return '—'
  const s = String(v).slice(0, 10).split('-')
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : String(v)
}

export function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] || { label: estado || '—', badge: 'badge-gray' }
  return <span className={`badge ${e.badge}`}>{e.label}</span>
}

export function Tarjeta({ titulo, valor, detalle, color }) {
  return (
    <div className="card">
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7a9a72' }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || '#e8f5e9', marginTop: 4 }}>{valor}</div>
      {detalle && <div style={{ fontSize: 11, color: '#7a9a72', marginTop: 2 }}>{detalle}</div>}
    </div>
  )
}

export function Aviso({ tipo = 'info', children }) {
  const c = tipo === 'error' ? '#ef5350' : tipo === 'ok' ? '#B5E000' : '#7a9a72'
  return <div className="info-box" style={{ borderColor: c }}><span className="info-icon" style={{ color: c }}>{tipo === 'error' ? '!' : tipo === 'ok' ? '✓' : 'i'}</span><div style={{ fontSize: 12 }}>{children}</div></div>
}

export function Cargando({ texto = 'Cargando…' }) {
  return <div style={{ padding: 24, textAlign: 'center', color: '#7a9a72', fontSize: 12 }}>{texto}</div>
}

export function Paginador({ pagina, total, porPagina, onCambiar }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  return (
    <div className="filter-bar" style={{ justifyContent: 'space-between', marginTop: 10 }}>
      <div className="filter-results"><span>{total.toLocaleString('es-AR')}</span> resultados</div>
      <div className="filter-bar">
        <button className="btn-ghost" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>‹</button>
        <span style={{ fontSize: 11, color: '#7a9a72' }}>Página {pagina} de {paginas}</span>
        <button className="btn-ghost" disabled={pagina >= paginas} onClick={() => onCambiar(pagina + 1)}>›</button>
      </div>
    </div>
  )
}

export function usuarioDe(session) {
  return session?.user?.email?.split('@')[0] || null
}
