import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Il carattere lo importa index.css insieme al resto del sistema visivo:
// tenerlo in due posti significherebbe cambiarne uno e dimenticare l'altro.
import './index.css'
import App from './App.tsx'
import { ErroreGlobale } from './ErroreGlobale.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sta qui e non dentro App: un errore nei provider di sessione e di dati
        collasserebbe l'albero prima di qualunque rete piazzata più in basso. */}
    <ErroreGlobale>
      <App />
    </ErroreGlobale>
  </StrictMode>,
)
