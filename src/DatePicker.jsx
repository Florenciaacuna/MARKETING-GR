import { useState, useEffect, useRef } from 'react'

const BRAND  = '#B5E000'
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS   = ['Lu','Ma','Mi','Ju','Vi','Sa','Do']

function pad(n) { return String(n).padStart(2,'0') }
function toStr(d) { return d ? d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) : '' }
function fmtDisplay(s) { if (!s) return ''; const p = s.split('-'); return p[2]+'/'+p[1]+'/'+p[0] }
function fromStr(s) { if (!s) return null; const p = s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]) }

export default function DatePicker({ label, value, onChange, minDate, maxDate }) {
  const [open,    setOpen]    = useState(false)
  const [viewing, setViewing] = useState(() => {
    const d = fromStr(value) || new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const ref = useRef()

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function getCells() {
    const y = viewing.getFullYear()
    const m = viewing.getMonth()
    const first = new Date(y, m, 1)
    const last  = new Date(y, m+1, 0)
    let dow = first.getDay() - 1
    if (dow < 0) dow = 6
    const cells = Array(dow).fill(null)
    for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d))
    return cells
  }

  function select(d) { onChange(toStr(d)); setOpen(false) }
  function clearVal(e) { e.stopPropagation(); onChange('') }
  function prevMonth() { setViewing(v => new Date(v.getFullYear(), v.getMonth()-1, 1)) }
  function nextMonth() { setViewing(v => new Date(v.getFullYear(), v.getMonth()+1, 1)) }

  const cells  = getCells()
  const today  = toStr(new Date())

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none',
        background:'#111', border: open ? '1px solid '+BRAND : '1px solid #2a2a2a',
        borderRadius:8, padding:'6px 12px', minWidth:148, transition:'border-color 0.15s'
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={value ? BRAND : '#4b5563'} strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8"  y1="2" x2="8"  y2="6"/>
          <line x1="3"  y1="10" x2="21" y2="10"/>
        </svg>
        <span style={{ fontSize:12, color: value ? '#fff' : '#6b7280', flex:1, whiteSpace:'nowrap' }}>
          {value ? fmtDisplay(value) : (label || 'Seleccionar fecha')}
        </span>
        {value && (
          <span onClick={clearVal} style={{ color:'#4b5563', fontSize:16, cursor:'pointer', lineHeight:1 }}>x</span>
        )}
      </div>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 8px)', left:0, zIndex:9999,
          background:'#111', border:'1px solid #2a2a2a', borderRadius:12, padding:16,
          boxShadow:'0 8px 40px rgba(0,0,0,0.7)', width:260
        }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <button onClick={prevMonth} style={{ background:'none', border:'none', color:'#9ca3af', cursor:'pointer', fontSize:18, padding:'0 6px', lineHeight:1 }}>
              &lsaquo;
            </button>
            <span style={{ color:'#fff', fontWeight:700, fontSize:13 }}>
              {MONTHS[viewing.getMonth()]} {viewing.getFullYear()}
            </span>
            <button onClick={nextMonth} style={{ background:'none', border:'none', color:'#9ca3af', cursor:'pointer', fontSize:18, padding:'0 6px', lineHeight:1 }}>
              &rsaquo;
            </button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:6 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:10, color:'#4b5563', fontWeight:700, padding:'2px 0' }}>{d}</div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />
              const ds    = toStr(d)
              const isSel = ds === value
              const isDis = (minDate && ds < minDate) || (maxDate && ds > maxDate)
              const isTod = ds === today
              return (
                <button key={i} onClick={() => !isDis && select(d)} disabled={isDis}
                  style={{
                    background: isSel ? BRAND : 'none',
                    border: isTod && !isSel ? '1px solid #3a3a3a' : '1px solid transparent',
                    borderRadius:6, color: isDis ? '#2a2a2a' : isSel ? '#000' : '#fff',
                    cursor: isDis ? 'default' : 'pointer', fontSize:12,
                    fontWeight: isSel ? 700 : 400, padding:'6px 0', textAlign:'center'
                  }}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div style={{ display:'flex', gap:6, marginTop:12, paddingTop:12, borderTop:'1px solid #1f1f1f' }}>
            <button onClick={() => select(new Date())}
              style={{ flex:1, background:'#1a2e00', border:'1px solid #2a3d00', borderRadius:6, color: BRAND, fontSize:11, fontWeight:600, padding:'5px 0', cursor:'pointer' }}>
              Hoy
            </button>
            <button onClick={() => {
              const d = new Date()
              const m = pad(d.getMonth()+1)
              onChange(d.getFullYear()+'-'+m+'-01')
              setOpen(false)
            }}
              style={{ flex:1, background:'#1a2e00', border:'1px solid #2a3d00', borderRadius:6, color: BRAND, fontSize:11, fontWeight:600, padding:'5px 0', cursor:'pointer' }}>
              1ro del mes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
