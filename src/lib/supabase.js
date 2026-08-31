import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://vlrwpxgazfquegjfajtv.supabase.co'
const SUPABASE_KEY = 'sb_publishable_pgZPcP7kWOeW9TWPL2e7kw_sOSbgK3q'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
