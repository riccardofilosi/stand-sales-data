import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { messaggioAccesso, messaggioRegistrazione } from '../lib/erroriAuth'

type Modo = 'entra' | 'registrati'

export function Login() {
  const [modo, setModo] = useState<Modo>('entra')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const invia = async (e: FormEvent) => {
    e.preventDefault()
    setInCorso(true)
    setErrore(null)
    setAvviso(null)

    if (modo === 'entra') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setErrore(messaggioAccesso(error))
    } else {
      // Il ruolo NON si manda: handle_new_user (024) fa nascere l'utente
      // operatore. Il nome sì.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nome: nome.trim() } },
      })
      if (error) {
        setErrore(messaggioRegistrazione(error))
      } else if (!data.session) {
        // Conferma email attiva: la sessione arriva solo dopo il clic sul link.
        setAvviso('Controlla la posta: c’è un link per confermare l’indirizzo.')
      }
    }
    setInCorso(false)
  }

  const registrazione = modo === 'registrati'

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <form onSubmit={invia} className="w-full max-w-sm">
        <div className="plancia p-5">
          <h1 className="text-[32px] font-semibold leading-none">Veneto</h1>
          <p className="tenue text-[15px] mt-1">La cassa dello stand</p>

          <div
            aria-hidden="true"
            className="h-px my-5"
            style={{ background: 'var(--accent)', opacity: 0.5 }}
          />

          {registrazione && (
            <>
              <label
                className="tenue text-[13px] font-semibold uppercase tracking-wide"
                htmlFor="nome"
              >
                Nome
              </label>
              <input
                id="nome"
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="name"
                required
                className="campo w-full px-4 mt-1 mb-4"
              />
            </>
          )}

          <label className="tenue text-[13px] font-semibold uppercase tracking-wide" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            className="campo w-full px-4 mt-1 mb-4"
          />

          <label className="tenue text-[13px] font-semibold uppercase tracking-wide" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={registrazione ? 'new-password' : 'current-password'}
            required
            minLength={registrazione ? 12 : undefined}
            className="campo w-full px-4 mt-1"
          />
          {registrazione && <p className="tenue text-[13px] mt-1">Almeno 12 caratteri.</p>}

          {errore && (
            <p role="alert" className="flex items-start gap-2 mt-4 text-[15px]">
              <span
                aria-hidden="true"
                className="num shrink-0 grid place-items-center w-6 h-6 rounded-[6px] font-bold"
                style={{ background: 'var(--rosso-fondo)', color: 'var(--ink)' }}
              >
                !
              </span>
              <span>{errore}</span>
            </p>
          )}

          {avviso && (
            <p role="status" className="mt-4 text-[15px]">
              {avviso}
            </p>
          )}

          <button
            type="submit"
            disabled={inCorso}
            className="bottone-forte w-full min-h-[96px] mt-5 text-[22px]"
          >
            {inCorso ? 'Un momento…' : registrazione ? 'Registrati' : 'Entra'}
          </button>

          {/* Il cambio di modo azzera gli esiti, non i campi: chi sbaglia
              bottone non deve ribattere l'email. */}
          <button
            type="button"
            onClick={() => {
              setModo(registrazione ? 'entra' : 'registrati')
              setErrore(null)
              setAvviso(null)
            }}
            className="bottone-quieto w-full min-h-[48px] mt-3 text-[15px]"
          >
            {registrazione ? 'Hai già un account? Entra' : 'Non hai un account? Registrati'}
          </button>
        </div>
      </form>
    </div>
  )
}
