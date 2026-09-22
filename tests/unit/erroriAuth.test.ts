import { describe, it, expect } from 'vitest'
import { messaggioAccesso, messaggioRegistrazione } from '../../src/lib/erroriAuth'

describe('messaggioRegistrazione', () => {
  // Il difetto del 21/08: al terzo iscritto nella stessa ora Auth risponde
  // 429 e l'app diceva «Riprova», che era il consiglio peggiore possibile —
  // il contatore si azzera dopo un'ora, non dopo un tocco.
  it('dice che il limite è orario, invece di invitare a ritentare subito', () => {
    const m = messaggioRegistrazione({
      code: 'over_email_send_rate_limit',
      message: 'email rate limit exceeded',
    })
    expect(m).toMatch(/ora/)
    expect(m).not.toMatch(/Riprova\.$/)
  })

  it('riconosce un indirizzo già iscritto', () => {
    expect(messaggioRegistrazione({ code: 'user_already_exists', message: 'User already registered' })).toBe(
      'Questo indirizzo ha già un account: prova a entrare.',
    )
  })

  it('separa la password corta da quella troppo comune', () => {
    expect(
      messaggioRegistrazione({
        code: 'weak_password',
        message: 'Password should be at least 12 characters.',
      }),
    ).toBe('La password deve avere almeno 12 caratteri.')
    expect(
      messaggioRegistrazione({
        code: 'weak_password',
        message: 'Password is known to be weak and easy to guess, please choose a different one.',
      }),
    ).toBe('Questa password è troppo comune: scegline un’altra.')
  })

  // La regola vecchia era /at least|password/i: intercettava QUALUNQUE errore
  // che contenesse la parola «password» e lo spacciava per un problema di
  // lunghezza. Il limite orario ci cascava dentro.
  it('non spaccia per lunghezza un errore che nomina la password per caso', () => {
    expect(
      messaggioRegistrazione({ code: 'validation_failed', message: 'password and email required' }),
    ).not.toMatch(/12 caratteri/)
  })

  it('riconosce le registrazioni chiuse', () => {
    expect(messaggioRegistrazione({ code: 'signup_disabled', message: 'Signups not allowed for this instance' })).toBe(
      'Le registrazioni sono chiuse. Chiedi al capo stand.',
    )
  })

  it('riconosce la rete assente', () => {
    expect(messaggioRegistrazione(new TypeError('Failed to fetch'))).toBe(
      'Nessuna rete. Riprova quando torna la linea.',
    )
  })

  it('ripiega su una frase onesta', () => {
    expect(messaggioRegistrazione({ code: 'unexpected_failure', message: 'boom' })).toBe(
      'Registrazione non riuscita. Riprova.',
    )
  })
})

describe('messaggioAccesso', () => {
  // Prima ogni rifiuto diventava «Email o password non corretti»: chi non
  // aveva confermato l'indirizzo ribatteva la password giusta all'infinito.
  it('distingue l’indirizzo non confermato dalla password sbagliata', () => {
    expect(messaggioAccesso({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toMatch(
      /conferma/i,
    )
    expect(messaggioAccesso({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'Email o password non corretti.',
    )
  })

  it('riconosce i troppi tentativi', () => {
    expect(
      messaggioAccesso({ code: 'over_request_rate_limit', message: 'Request rate limit reached' }),
    ).toMatch(/tentativi/i)
  })

  it('riconosce la rete assente', () => {
    expect(messaggioAccesso(new TypeError('Failed to fetch'))).toBe(
      'Nessuna rete. Riprova quando torna la linea.',
    )
  })

  // Un rifiuto sconosciuto non deve accusare di password sbagliata chi la
  // password ce l'ha giusta.
  it('ripiega senza dare la colpa alle credenziali', () => {
    expect(messaggioAccesso({ code: 'unexpected_failure', message: 'boom' })).toBe(
      'Accesso non riuscito. Riprova.',
    )
  })
})
