import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('URL:', SUPABASE_URL)
console.log('Key:', SUPABASE_KEY?.slice(0, 30))

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
