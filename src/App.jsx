import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login         from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard     from './pages/Dashboard'
import Campanas      from './pages/Campanas'
import Leads         from './pages/Leads'
import Carga         from './pages/Carga'

const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'campanas',  icon: '🎯', label: 'Campañas'  },
  { id: 'leads',     icon: '👥', label: 'Leads'     },
  { id: 'carga',     icon: '📁', label: 'Carga'     },
]

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [tab,     setTab]     = useState('dashboard')

  // Detectar si es la página de reset de contraseña
  const isReset = window.location.hash.includes('access_token') ||
                  window.location.pathname === '/reset-password'

  useEffect(() => {
    // Sesión actual
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    // Escuchar cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Pantalla de reset de contraseña (viene del link del mail)
  if (isReset) return <ResetPassword />

  // Cargando sesión
  if (session === undefined) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: '#0f172a' }}>
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl font-black text-2xl mb-4"
          style={{ background: '#8BC34A', color: '#0f172a' }}>
          Z
        </div>
        <div className="text-gray-400 text-sm animate-pulse">Cargando...</div>
      </div>
    </div>
  )

  // Sin sesión → Login
  if (!session) return <Login onLogin={() => supabase.auth.getSession().then(({ data }) => setSession(data.session))} />

  // ── APP PRINCIPAL ──────────────────────────────────────
  const user = session.user
  const initials = (user.email?.[0] || 'U').toUpperCase()
  const username = user.email?.split('@')[0] || 'Usuario'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">

      {/* ── SIDEBAR ── */}
      <aside className="w-56 flex-shrink-0 flex flex-col"
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' }}>

        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-lg shadow-lg"
              style={{ background: '#8BC34A', color: '#0f172a' }}>
              Z
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight">Grupo Randazzo</div>
              <div className="text-xs" style={{ color: '#8BC34A' }}>Marketing</div>
            </div>
          </div>
        </div>

        {/* Conectado */}
        <div className="px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 shadow shadow-green-400/50"></div>
            <span className="text-xs text-gray-400">Conectado</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-3 mb-3">
            Principal
          </div>
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all text-left
                ${tab === item.id
                  ? 'shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              style={tab === item.id
                ? { background: '#8BC34A', color: '#0f172a' }
                : {}}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Usuario + Logout */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ background: '#8BC34A', color: '#0f172a' }}>
              {initials}
            </div>
            <div className="overflow-hidden">
              <div className="text-white text-xs font-medium truncate">{username}</div>
              <div className="text-gray-500 text-xs truncate">{user.email}</div>
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full text-xs text-gray-500 hover:text-red-400 transition-colors
              flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5"
          >
            <span>⎋</span> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-8 py-3
          flex items-center justify-between shadow-sm">
          <h1 className="font-bold text-gray-800 text-lg">
            {NAV.find(n => n.id === tab)?.label}
          </h1>
          <div className="text-sm text-gray-400">
            {new Date().toLocaleDateString('es-AR', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            })}
          </div>
        </div>

        {/* Page content */}
        <div className="p-8">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'campanas'  && <Campanas  />}
          {tab === 'leads'     && <Leads     />}
          {tab === 'carga'     && <Carga     />}
        </div>
      </main>
    </div>
  )
}
