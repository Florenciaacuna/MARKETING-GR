import { createClient } from '@supabase/supabase-js'

// Las claves NO van en el código: se cargan como variables de entorno (Vercel / archivo .env)
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configurado = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost', key || 'sin-clave')
