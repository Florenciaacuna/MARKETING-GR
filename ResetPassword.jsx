import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState(false)
  const [validLink, setValidLink] = useState(false)

  useEffect(() => {
    // Supabase pone el token en el hash de la URL
    const hash = window.location.hash
    if (hash.includes('access_token')) {
      setValidLink(true)
    }
  }, [])

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    if (password.length < 8)  { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError('No se pudo actualizar la contraseña. El link puede haber expirado.')
    else setSuccess(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)' }}>
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl font-black text-3xl mb-4"
            style={{ background: '#8BC34A', color: '#0f172a' }}>
            Z
          </div>
          <div className="text-white font-bold text-xl">Grupo Randazzo</div>
          <div className="text-sm mt-1" style={{ color: '#8BC34A' }}>Marketing Dashboard</div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {success ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">🎉</div>
              <h2 className="font-bold text-gray-800 text-xl mb-2">Contraseña actualizada</h2>
              <p className="text-gray-400 text-sm mb-6">Ya podés usar tu nueva contraseña para ingresar.</p>
              <a href="/"
                className="block w-full py-3 rounded-xl font-bold text-sm text-center"
                style={{ background: '#8BC34A', color: '#0f172a' }}>
                Ir al login
              </a>
            </div>
          ) : !validLink ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">❌</div>
              <h2 className="font-bold text-gray-800 text-lg mb-2">Link inválido</h2>
              <p className="text-gray-400 text-sm">Este link expiró o ya fue usado. Solicitá uno nuevo.</p>
              <a href="/" className="block mt-4 text-sm text-center" style={{ color: '#8BC34A' }}>
                Volver al login
              </a>
            </div>
          ) : (
            <>
              <h2 className="font-bold text-gray-800 text-xl mb-2">Nueva contraseña</h2>
              <p className="text-gray-400 text-sm mb-6">Elegí una contraseña segura de al menos 8 caracteres.</p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Nueva contraseña
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm
                      focus:outline-none focus:border-[#8BC34A] focus:ring-2 focus:ring-[#8BC34A]/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repetí la contraseña"
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm
                      focus:outline-none focus:border-[#8BC34A] focus:ring-2 focus:ring-[#8BC34A]/20 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60 mt-2"
                  style={{ background: '#8BC34A', color: '#0f172a' }}
                >
                  {loading ? 'Guardando...' : 'Guardar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
