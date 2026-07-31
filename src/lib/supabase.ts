import { createClient } from '@supabase/supabase-js'

// Progetto Supabase "guardia-medica": le tabelle di CACCA hanno il prefisso
// cacca_ e regole RLS per email, quindi la chiave pubblica qui sotto da sola
// non apre nulla: serve il login Google di un indirizzo autorizzato.
export const SUPABASE_URL = 'https://lrvkchqvjzynfzevpqaj.supabase.co'
const CHIAVE_PUBBLICA =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxydmtjaHF2anp5bmZ6ZXZwcWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDY5NjksImV4cCI6MjA5MzIyMjk2OX0.XZXyUt9UNepHvr4HBLgCkywQYsXwtmvwYCsRrlAMBv4'

export const supabase = createClient(SUPABASE_URL, CHIAVE_PUBBLICA, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

/** Client ID Google (progetto "sistema turni app"): login e accesso a Drive. */
export const GOOGLE_CLIENT_ID =
  '855709488250-ecan1t1dh7hdb5amf37bg0u6gl04pjlo.apps.googleusercontent.com'
