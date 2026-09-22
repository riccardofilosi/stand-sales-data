import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Variabili Supabase mancanti. Copiare .env.example in .env.local e riempirlo.'
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // La sessione dura a lungo di proposito: gli operatori entrano una volta,
    // il giorno della sagra, e non devono ritrovarsi la schermata di login
    // dietro il banco nell'ora di punta.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
