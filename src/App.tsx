import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { PreferenzeProvider } from './hooks/usePreferenze'
import { MeseProvider } from './hooks/useMese'
import { ToastProvider } from './hooks/useToast'
import Layout from './components/Layout'
import AggiornaWebBanner from './components/AggiornaWebBanner'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import TurniPage from './pages/TurniPage'
import RiepiloghiPage from './pages/RiepiloghiPage'
import PrevisionePage from './pages/PrevisionePage'
import CedoliniPage from './pages/CedoliniPage'
import TariffePage from './pages/TariffePage'
import ProfiloPage from './pages/ProfiloPage'

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <PreferenzeProvider>
          <Contenuto />
          <AggiornaWebBanner />
        </PreferenzeProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

function Contenuto() {
  const { caricamento, utente } = useAuth()

  if (caricamento) {
    return <div className="flex min-h-full items-center justify-center text-cielo-500">Caricamento…</div>
  }

  // Senza login (o senza autorizzazione) non si vede nulla dei dati.
  if (!utente || !utente.autorizzato) return <LoginPage />

  return (
    <MeseProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/turni" element={<TurniPage />} />
            <Route path="/riepiloghi" element={<RiepiloghiPage />} />
            <Route path="/previsione" element={<PrevisionePage />} />
            <Route path="/cedolini" element={<CedoliniPage />} />
            <Route path="/tariffe" element={<TariffePage />} />
            <Route path="/profilo" element={<ProfiloPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </MeseProvider>
  )
}
