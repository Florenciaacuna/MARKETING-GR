import { useState, useEffect, useRef } from 'react'

const BRAND  = '#B5E000'
const MESES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS   = ['LU','MA','MI','JU','VI','SA','DO']

function pad(n) { return String(n).padStart(2,'0') }

function toISO(d) {
  if (!d) return ''
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
}
function fromISO(s) {
  if (!s) return null
  const [y,m,d] = s.split('-')
  return new Date(+y, +m-1, +d)
}
function toDisplay(s) {
  if (!s) return ''
  const [y,m,d] = s.split('-')
  return d + '/' + m + '/' + y
}

export default function DatePicker({ label, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [nav,  setNav]  = useState(() => {
    const ref = fromISO(value) || new Date()
    return { y: ref.getFullYear(), m: ref.getMonth() }
  })
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function prevMonth() {
    setNav(n => n.m === 0 ? { y: n.y-1, m: 11 } : { y: n.y, m: n.m-1 })
  }
  function nextMonth() {
    setNav(n => n.m === 11 ? { y: n.y+1, m: 0 } : { y: n.y, m: n.m+1 })
  }

  function buildCells() {
    const first = new Date(nav.y, nav.m, 1)
    const last  = new Date(nav.y, nav.m+1, 0)
    let dow = first.getDay() - 1
    if (dow < 0) dow = 6
    const cells = Array(dow).fill(null)
    for (let d = 1; d <= last.getDate(); d++) {
      cells.push(new Date(nav.y, nav.m, d))
    }
    return cells
  }

  function pick(d) {
    onChange(toISO(d))
    setOpen(false)
  }

  function clear(e) {
    e.stopPropagation()
    onChange('')
  }

  function today() {
    const t = new Date()
    onChange(toISO(t))
    setNav({ y: t.getFullYear(), m: t.getMonth() })
    setOpen(false)
  }

  const todayStr = toISO(new Date())
  const cells    = buildCells()

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block', userSelect:'none' }}>

      {/* Trigger */}
      <div
        onClick={() => {
          if (!open && ref.current) {
            const r = ref.current.getBoundingClientRect()
            setPos({ top: r.bottom + 6, left: r.left })
          }
          setOpen(o => !o)
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#111', border: `1px solid ${open ? BRAND : '#3a3a3a'}`,
          borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
          minWidth: 152, transition: 'border-color 0.15s'
        }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke={value ? BRAND : '#555'} strokeWidth="2" style={{ flexShrink:0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8"  y1="2" x2="8"  y2="6"/>
          <line x1="3"  y1="10" x2="21" y2="10"/>
        </svg>
        <span style={{ fontSize: 12, color: value ? '#fff' : '#555', flex: 1, whiteSpace:'nowrap' }}>
          {value ? toDisplay(value) : label || 'dd/mm/aaaa'}
        </span>
        {value && (
          <span
            onClick={clear}
            style={{ color:'#555', fontSize:14, cursor:'pointer', lineHeight:1, paddingLeft:4 }}>
            ×
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999,
          background: '#181818', border: '1px solid #333',
          borderRadius: 12, padding: 16, width: 272,
          boxShadow: '0 12px 40px rgba(0,0,0,0.7)'
        }}>

          {/* Navegación mes */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <button onClick={prevMonth} style={{
              background:'none', border:'none', color:'#888', cursor:'pointer',
              fontSize:18, lineHeight:1, padding:'2px 8px', borderRadius:6
            }}>&#8249;</button>

            <span style={{ color:'#fff', fontWeight:700, fontSize:13 }}>
              {MESES[nav.m].toLowerCase()} de {nav.y}
            </span>

            <button onClick={nextMonth} style={{
              background:'none', border:'none', color:'#888', cursor:'pointer',
              fontSize:18, lineHeight:1, padding:'2px 8px', borderRadius:6
            }}>&#8250;</button>
          </div>

          {/* Headers días */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
            {DIAS.map(d => (
              <div key={d} style={{
                textAlign:'center', fontSize:10, fontWeight:700,
                color:'#555', padding:'2px 0'
              }}>{d}</div>
            ))}
          </div>

          {/* Grilla días */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px 0' }}>
            {cells.map((d, i) => {
              if (!d) return <div key={'e'+i} />
              const ds    = toISO(d)
              const isSel = ds === value
              const isTod = ds === todayStr
              return (
                <button
                  key={ds}
                  onClick={() => pick(d)}
                  style={{
                    background: isSel ? BRAND : 'none',
                    border: isTod && !isSel ? `1px solid #444` : '1px solid transparent',
                    borderRadius: 6,
                    color: isSel ? '#000' : isTod ? BRAND : '#ccc',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: isSel || isTod ? 700 : 400,
                    padding: '6px 0',
                    textAlign: 'center',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#1a2e00' }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'none' }}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {/* Acciones */}
          <div style={{
            display:'flex', justifyContent:'space-between',
            marginTop:14, paddingTop:12, borderTop:'1px solid #2a2a2a'
          }}>
            <button
              onClick={() => { onChange(''); setOpen(false) }}
              style={{
                background:'none', border:'none', color:'#888',
                cursor:'pointer', fontSize:12, padding:'4px 8px',
                borderRadius:6
              }}>
              Borrar
            </button>
            <button
              onClick={today}
              style={{
                background: '#1a2e00', border:`1px solid ${BRAND}`,
                color: BRAND, cursor:'pointer', fontSize:12,
                fontWeight:700, padding:'4px 14px', borderRadius:6
              }}>
              Hoy
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
