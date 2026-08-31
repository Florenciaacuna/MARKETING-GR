import { useState } from 'react'
import Carga     from './pages/Carga'
import Campanas  from './pages/Campanas'
import Leads     from './pages/Leads'
import Dashboard from './pages/Dashboard'

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'campanas',  label: '🎯 Campañas'  },
  { id: 'leads',     label: '👥 Leads'     },
  { id: 'carga',     label: '📁 Carga'     },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="min-h-screen bg-gray-100">
      {/* HEADER */}
      <header className="bg-[#1a1a1a] text-white shadow-lg">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[#8BC34A] font-black text-2xl tracking-tight">GR</span>
            <div>
              <div className="font-bold text-sm leading-none">Grupo Randazzo</div>
              <div className="text-gray-400 text-xs">Marketing Dashboard</div>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            {new Date().toLocaleDateString('es-AR', { dateStyle: 'long' })}
          </div>
        </div>

        {/* TABS */}
        <nav className="max-w-screen-xl mx-auto px-6 flex gap-1 pb-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 text-sm font-medium rounded-t transition-all
                ${tab === t.id
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* CONTENT */}
      <main className="max-w-screen-xl mx-auto px-6 py-6">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'campanas'  && <Campanas  />}
        {tab === 'leads'     && <Leads     />}
        {tab === 'carga'     && <Carga     />}
      </main>
    </div>
  )
}
