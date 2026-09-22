/**
 * I rifiuti di Auth, tradotti. Stanno qui e non in `errori.ts` perché hanno
 * un'altra forma: Postgres cita nomi di vincoli, Auth manda un `error_code`
 * suo e un `msg` in inglese.
 *
 * La regola vale come per il database: ciò che non è riconosciuto non si
 * mostra. Ma il ripiego deve restare ONESTO — «Riprova» davanti a un limite
 * che si azzera fra un'ora manda una persona a sbattere venti volte.
 */

type ErroreAuth = { code?: string | null; message?: string | null }

const RETE = /failed to fetch|networkerror|network request failed|fetch failed/i

function pezzi(errore: unknown): { code: string; message: string } {
  const e = (errore ?? {}) as ErroreAuth
  return {
    code: typeof e.code === 'string' ? e.code : '',
    message: typeof e.message === 'string' ? e.message : String(errore),
  }
}

export function messaggioRegistrazione(errore: unknown): string {
  const { code, message } = pezzi(errore)

  if (RETE.test(message)) return 'Nessuna rete. Riprova quando torna la linea.'

  // Il difetto del 21/08. Auth spedisce la mail di conferma e conta gli invii
  // per ora: dal terzo iscritto in poi risponde 429, e nessun utente viene
  // creato. Il numero non si dice — dipende da una configurazione che può
  // cambiare — ma l'ordine di grandezza sì, perché è quello che serve sapere.
  if (/rate.?limit/i.test(code) || /rate limit/i.test(message)) {
    return 'Troppe registrazioni in poco tempo: il limite si azzera dopo un’ora. Riprova più tardi, oppure fatti creare l’account dal capo stand.'
  }

  if (code === 'user_already_exists' || code === 'email_exists' || /already (been )?registered/i.test(message)) {
    return 'Questo indirizzo ha già un account: prova a entrare.'
  }

  // Solo `weak_password` parla davvero della password: la regola vecchia
  // guardava la parola «password» ovunque comparisse, e ci cascava dentro
  // mezzo catalogo di errori che con la password non c'entravano.
  if (code === 'weak_password') {
    return /weak|easy to guess|pwned|breach/i.test(message)
      ? 'Questa password è troppo comune: scegline un’altra.'
      : 'La password deve avere almeno 12 caratteri.'
  }

  if (code === 'signup_disabled' || /signups not allowed/i.test(message)) {
    return 'Le registrazioni sono chiuse. Chiedi al capo stand.'
  }

  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(message)) {
    return 'Quell’indirizzo email non è valido.'
  }

  return 'Registrazione non riuscita. Riprova.'
}

export function messaggioAccesso(errore: unknown): string {
  const { code, message } = pezzi(errore)

  if (RETE.test(message)) return 'Nessuna rete. Riprova quando torna la linea.'

  // Email inesistente e password sbagliata restano indistinguibili: dirlo
  // direbbe a chi prova quali indirizzi hanno un account.
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'Email o password non corretti.'
  }

  // Questo invece si distingue. Non è una fuga di informazioni che conti: la
  // registrazione è aperta, quindi chiunque scopre già da lì se un indirizzo
  // è preso. E chi non ha confermato, senza saperlo, ribatte la password
  // giusta finché non si arrende.
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'Devi prima confermare l’indirizzo: apri il link che ti è arrivato per email.'
  }

  if (/rate.?limit/i.test(code) || /rate limit/i.test(message)) {
    return 'Troppi tentativi ravvicinati. Aspetta qualche minuto e riprova.'
  }

  // Il ripiego NON accusa le credenziali: qui ci finisce anche chi la
  // password ce l'ha giusta.
  return 'Accesso non riuscito. Riprova.'
}
