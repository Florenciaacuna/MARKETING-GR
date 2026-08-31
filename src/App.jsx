import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login         from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard     from './pages/Dashboard'
import Campanas      from './pages/Campanas'
import Leads         from './pages/Leads'
import Carga         from './pages/Carga'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  )},
  { id: 'campanas', label: 'Campañas', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  )},
  { id: 'leads', label: 'Leads', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )},
  { id: 'carga', label: 'Carga', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )},
]

const BRAND = '#B5E000'
const DARK  = '#0a0a0a'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [tab,     setTab]     = useState('dashboard')

  const isReset = window.location.hash.includes('access_token') ||
                  window.location.pathname === '/reset-password'

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (isReset) return <ResetPassword />

  if (session === undefined) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: DARK }}>
      <img src="/logo.png" alt="Grupo Randazzo" className="h-12 w-auto animate-pulse" />
    </div>
  )

  if (!session) return (
    <Login onLogin={() => supabase.auth.getSession().then(({ data }) => setSession(data.session))} />
  )

  const username = session.user.email?.split('@')[0] || 'Usuario'
  const initial  = (session.user.email?.[0] || 'U').toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f0f2f5' }}>

      {/* SIDEBAR */}
      <aside className="w-56 flex-shrink-0 flex flex-col" style={{ background: DARK }}>

        {/* Logo real */}
        <div className="px-5 py-4 border-b border-white/10">
          <img src="/logo.png" alt="Grupo Randazzo" className="h-10 w-auto" />
          <div className="text-xs font-semibold mt-2" style={{ color: BRAND }}>
            Marketing Dashboard
          </div>
        </div>

        {/* Estado */}
        <div className="px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400"></div>
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                font-medium transition-all text-left
                ${tab === item.id
                  ? 'shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              style={tab === item.id ? { background: BRAND, color: DARK } : {}}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Usuario */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center
              text-sm font-bold flex-shrink-0"
              style={{ background: BRAND, color: DARK }}>
              {initial}
            </div>
            <div className="overflow-hidden">
              <div className="text-white text-xs font-medium truncate">{username}</div>
              <div className="text-gray-500 text-xs truncate">{session.user.email}</div>
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full text-xs text-gray-500 hover:text-red-400 transition-colors
              flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto">
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
