import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login({ onLogin }) {
  const [mode,     setMode]     = useState('login') // 'login' | 'reset'
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
    if (error) setError('Email o contraseña incorrectos.')
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
    if (error) setError('No se pudo enviar el mail. Verificá el email.')
    else setSuccess('Te enviamos un mail para restablecer tu contraseña.')
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)' }}>

      {/* CARD */}
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl font-black text-3xl mb-4 shadow-lg"
            style={{ background: '#8BC34A', color: '#0f172a' }}>
            Z
          </div>
          <div className="text-white font-bold text-xl">Grupo Randazzo</div>
          <div className="text-sm mt-1" style={{ color: '#8BC34A' }}>Marketing Dashboard</div>
        </div>

        {/* FORM CARD */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {mode === 'login' ? (
            <>
              <h2 className="font-bold text-gray-800 text-xl mb-6">Iniciar sesión</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@gruporandazzo.com.ar"
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm
                      focus:outline-none focus:border-[#8BC34A] focus:ring-2 focus:ring-[#8BC34A]/20
                      transition-all placeholder-gray-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm
                      focus:outline-none focus:border-[#8BC34A] focus:ring-2 focus:ring-[#8BC34A]/20
                      transition-all placeholder-gray-300"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-bold text-sm transition-all
                    disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                  style={{ background: '#8BC34A', color: '#0f172a' }}
                >
                  {loading ? 'Ingresando...' : 'Ingresar'}
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
                className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-5 transition-colors"
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
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-4 text-center">
                  <div className="text-2xl mb-2">✅</div>
                  <div className="font-semibold">{success}</div>
                  <div className="text-xs text-green-600 mt-1">Revisá tu bandeja de entrada.</div>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="tu@gruporandazzo.com.ar"
                      required
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm
                        focus:outline-none focus:border-[#8BC34A] focus:ring-2 focus:ring-[#8BC34A]/20
                        transition-all placeholder-gray-300"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
                    style={{ background: '#8BC34A', color: '#0f172a' }}
                  >
                    {loading ? 'Enviando...' : 'Enviar link'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <div className="text-center mt-6 text-gray-600 text-xs">
          ¿No tenés acceso? Contactá al administrador.
        </div>
      </div>
    </div>
  )
}
