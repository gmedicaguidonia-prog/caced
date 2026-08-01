import { createClient } from '@supabase/supabase-js'

// Progetto Supabase "cacca" (account gmedicaguidonia, dedicato solo a questa
// app): tabelle cacca_* con regole RLS per email, quindi la chiave pubblica
// qui sotto da sola non apre nulla: serve il login Google di un indirizzo
// autorizzato.
export const SUPABASE_URL = 'https://ytcvswwsazqtjpuhvfku.supabase.co'
const CHIAVE_PUBBLICA =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0Y3Zzd3dzYXpxdGpwdWh2Zmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MTY5NTcsImV4cCI6MjEwMTA5Mjk1N30.FCeHs5OD2JB3GzwJgnsITpoTgz4Kup3O74uOmrTpjOs'

export const supabase = createClient(SUPABASE_URL, CHIAVE_PUBBLICA, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

// Client ID Google del progetto dedicato "Caced" (nessuna app in comune, così
// non si pestano i piedi a vicenda). Lo stesso client fa il login (via Supabase)
// e chiede il permesso per scrivere i PDF su Drive.
export const GOOGLE_CLIENT_ID =
  '595929371139-7ebut2pms184vrc2s2ibf2r0lc3t77cg.apps.googleusercontent.com'
