import { useState, useEffect } from 'react'
import { supabase, configurado } from './lib/supabase'
import Login         from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Cargar        from './pages/Cargar'
import Vinculos      from './pages/Vinculos'
import Confirmar     from './pages/Confirmar'
import Seguimiento   from './pages/Seguimiento'
import Configuracion from './pages/Configuracion'

const BRAND = '#B5E000'
const DARK  = '#0a0a0a'

const NAV = [
  { id: 'cargar',        label: 'Cargar',        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
  { id: 'vinculos',      label: 'Vínculos',      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> },
  { id: 'confirmar',     label: 'Confirmar',     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
  { id: 'seguimiento',   label: 'Seguimiento',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { id: 'configuracion', label: 'Configuración', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
]

// Ícono hamburguesa / flecha
function IconToggle({ open }) {
  return open
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="15 18 9 12 15 6"/></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="9 18 15 12 9 6"/></svg>
}

export default function App() {
  const [session,   setSession]   = useState(undefined)
  const [tab,       setTab]       = useState('cargar')
  const [sideOpen,  setSideOpen]  = useState(() => {
    try { return localStorage.getItem('gr_sidebar') !== 'closed' } catch { return true }
  })

  const toggleSide = () => setSideOpen(v => {
    const next = !v
    try { localStorage.setItem('gr_sidebar', next ? 'open' : 'closed') } catch {}
    return next
  })

  const isReset = window.location.hash.includes('access_token')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (!configurado) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: DARK, color: '#e8f5e9' }}>
      <div className="card" style={{ maxWidth: 520 }}>
        <b>Falta conectar la base de datos.</b>
        <p style={{ fontSize: 12, marginTop: 8, color: '#7a9a72' }}>Cargá las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (en Vercel: Settings → Environment Variables) y volvé a hacer el deploy.</p>
      </div>
    </div>
  )
  if (isReset) return <ResetPassword />
  if (session === undefined) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: DARK }}>
      <img src="/logo-randazzo.png" alt="Grupo Randazzo" className="h-12 w-auto animate-pulse" />
    </div>
  )
  if (!session) return <Login onLogin={() => supabase.auth.getSession().then(({ data }) => setSession(data.session))} />

  const username = session.user.email?.split('@')[0] || 'Usuario'
  const initial  = (session.user.email?.[0] || 'U').toUpperCase()

  const visibleTabs = NAV

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f0f0f' }}>

      {/* SIDEBAR */}
      <aside
        className="flex-shrink-0 flex flex-col border-r transition-all duration-200"
        style={{
          background: DARK,
          borderColor: '#1f1f1f',
          width: sideOpen ? 208 : 56,
          minWidth: sideOpen ? 208 : 56,
        }}
      >
        {/* Logo + toggle */}
        <div className="border-b flex items-center justify-between px-2 py-3" style={{ borderColor: '#1f1f1f' }}>
          {sideOpen && (
            <div style={{ flex: 1, paddingLeft: 4 }}>
              <img src="/logo-randazzo.png" alt="Grupo Randazzo"
                style={{ width: '100%', maxWidth: 148, display: 'block' }} />
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(181,224,0,0.6)', textTransform: 'uppercase' }}>
                  Marketing
                </span>
              </div>
            </div>
          )}
          <button
            onClick={toggleSide}
            title={sideOpen ? 'Colapsar menú' : 'Expandir menú'}
            className="flex items-center justify-center rounded-lg transition-colors hover:bg-white/5 text-gray-500 hover:text-white flex-shrink-0"
            style={{ width: 32, height: 32 }}>
            <IconToggle open={sideOpen} />
          </button>
        </div>

        {/* Conectado */}
        {sideOpen && (
          <div className="px-4 py-2.5 border-b" style={{ borderColor: '#1f1f1f' }}>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"></div>
              <span className="text-xs text-gray-500">Conectado</span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-hidden">
          {sideOpen && (
            <div className="text-xs font-bold text-gray-600 uppercase tracking-widest px-2 mb-2">Principal</div>
          )}
          {visibleTabs.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)}
              title={!sideOpen ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 rounded-lg text-xs font-semibold transition-all text-left
                ${sideOpen ? 'px-3 py-2' : 'justify-center px-0 py-2'}
                ${tab === item.id ? 'shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
              style={tab === item.id ? { background: BRAND, color: DARK } : {}}>
              {item.icon}
              {sideOpen && (
                <>
                  {item.label}
                </>
              )}
            </button>
          ))}
        </nav>

        {/* Usuario */}
        <div className="border-t" style={{ borderColor: '#1f1f1f' }}>
          {sideOpen ? (
            <div className="px-3 py-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: BRAND, color: DARK }}>{initial}</div>
                <div className="overflow-hidden">
                  <div className="text-white text-xs font-medium truncate">{username}</div>
                  <div className="text-gray-600 text-xs truncate">{session.user.email}</div>
                </div>
              </div>
              <button onClick={() => supabase.auth.signOut()}
                className="w-full text-xs text-gray-600 hover:text-red-400 transition-colors flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 text-left">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 flex-shrink-0">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Cerrar sesión
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center py-3 gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: BRAND, color: DARK }} title={session.user.email}>{initial}</div>
              <button onClick={() => supabase.auth.signOut()} title="Cerrar sesión"
                className="text-gray-600 hover:text-red-400 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto min-w-0" style={{ background: '#0f0f0f' }}>
        <div className="sticky top-0 z-10 px-6 py-3 flex items-center justify-between border-b"
          style={{ background: '#0a0a0a', borderColor: '#1f1f1f' }}>
          <h1 className="font-bold text-white text-sm uppercase tracking-widest">{NAV.find(n => n.id === tab)?.label}</h1>
          <div className="text-xs text-gray-500">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div className="p-6">
          {tab === 'cargar'        && <Cargar />}
          {tab === 'vinculos'      && <Vinculos session={session} />}
          {tab === 'confirmar'     && <Confirmar session={session} />}
          {tab === 'seguimiento'   && <Seguimiento />}
          {tab === 'configuracion' && <Configuracion />}
        </div>
      </main>
    </div>
  )
}
