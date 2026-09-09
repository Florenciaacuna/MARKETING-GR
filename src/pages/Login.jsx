import { useState } from 'react'
import { supabase } from '../lib/supabase'

const BRAND = '#B5E000'
const DARK  = '#0a0a0a'

export default function Login({ onLogin }) {
  const [mode,     setMode]     = useState('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    else onLogin()
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSuccess('Te enviamos un mail para restablecer tu contraseña.')
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${DARK} 0%, #111 60%, ${DARK} 100%)` }}>

      <div className="w-full max-w-sm px-4">

        {/* Logo real */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="Grupo Randazzo" className="h-16 w-auto" />
          </div>
          <div className="text-sm font-semibold mt-2" style={{ color: BRAND }}>
            Marketing Dashboard
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {mode === 'login' ? (
            <>
              <h2 className="font-bold text-gray-800 text-xl mb-6">Iniciar sesión</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm
                  rounded-lg px-4 py-3 mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                    Email
                  </label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="tu@gruporandazzo.com.ar" required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm
                      focus:outline-none transition-all placeholder-gray-300"
                    onFocus={e => e.target.style.borderColor = BRAND}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                    Contraseña
                  </label>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm
                      focus:outline-none transition-all placeholder-gray-300"
                    onFocus={e => e.target.style.borderColor = BRAND}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-3 rounded-xl font-black text-sm transition-all
                    disabled:opacity-60 mt-2 tracking-wide"
                  style={{ background: BRAND, color: DARK }}
                >
                  {loading ? 'Ingresando...' : 'INGRESAR'}
                </button>
              </form>

              <button
                onClick={() => { setMode('reset'); setError(''); setSuccess('') }}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-600 mt-5 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </>

          ) : (
            <>
              <button
                onClick={() => { setMode('login'); setError(''); setSuccess('') }}
                className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-5"
              >
                ← Volver
              </button>
              <h2 className="font-bold text-gray-800 text-xl mb-2">Restablecer contraseña</h2>
              <p className="text-gray-400 text-sm mb-6">
                Ingresá tu email y te mandamos un link para crear una nueva contraseña.
              </p>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                  {error}
                </div>
              )}
              {success ? (
                <div className="border text-sm rounded-lg px-4 py-4 text-center"
                  style={{ background: '#f0ffd0', borderColor: BRAND, color: '#3a5200' }}>
                  <div className="font-bold mb-1">Mail enviado</div>
                  <div className="text-xs">{success}</div>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="tu@gruporandazzo.com.ar" required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none"
                    onFocus={e => e.target.style.borderColor = BRAND}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                  />
                  <button
                    type="submit" disabled={loading}
                    className="w-full py-3 rounded-xl font-black text-sm disabled:opacity-60"
                    style={{ background: BRAND, color: DARK }}
                  >
                    {loading ? 'Enviando...' : 'ENVIAR LINK'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <div className="text-center mt-5 text-gray-600 text-xs">
          ¿No tenés acceso? Contactá al administrador.
        </div>
      

        {/* QR acceso invitado */}
        <div className="mt-6 p-4 rounded-xl text-center" style={{ background:'#111', border:'1px solid #2a2a2a' }}>
          <p className="text-xs mb-3" style={{ color:'#6b7280' }}>Acceso de solo lectura para invitados (móvil)</p>
          <div className="flex justify-center mb-3">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(window.location.origin+'?guest=1')}&bgcolor=111111&color=B5E000&margin=10`}
              alt="QR invitado"
              className="rounded-xl"
              style={{ border:'2px solid #2a2a2a' }}
            />
          </div>
          <p className="text-xs" style={{ color:'#4b5563' }}>Escaneá para ver Dashboard y Asignados</p>
          <a href="?guest=1" className="inline-block mt-2 text-xs px-3 py-1 rounded-lg"
            style={{ background:'#1a1a1a', color:'#6b7280', border:'1px solid #2a2a2a' }}>
            Entrar como invitado →
          </a>
        </div></div>
    </div>
  )
}
