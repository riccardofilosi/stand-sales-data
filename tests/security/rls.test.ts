import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let operatore: SupabaseClient
let anonimo: SupabaseClient
// Id dell'operatore: profiles e' leggibile da tutti (024), quindi `.single()`
// senza filtro salterebbe appena i profili sono due.
let uid: string

/**
 * Una variabile mancante non deve arrivare fino a `createClient`, dove diventa
 * «supabaseUrl is required» e non dice quale file riempire.
 */
function obbligatoria(nome: string): string {
  const valore = process.env[nome]
  if (!valore) {
    throw new Error(`Manca ${nome}. Copia .env.test.local.example in .env.test.local e riempilo.`)
  }
  return valore
}

/**
 * La suite attacca un database gia' in servizio, e diversi test partono da una
 * riga che deve esistere: senza edizione aperta o senza una vendita gia'
 * registrata fallirebbero leggendo `null`, con un errore che parla di
 * proprieta' di JavaScript invece che di cosa manca sul database.
 */
async function preparaIlCampo() {
  uid = (await operatore.auth.getUser()).data.user!.id
  const { data: profilo } = await operatore.from('profiles').select('role').eq('id', uid).single()
  if (profilo?.role !== 'operatore') {
    throw new Error(
      `L account di prova ha ruolo ${profilo?.role ?? 'sconosciuto'}: la suite prova cosa NON puo' fare un operatore, e da capo passerebbe per il motivo sbagliato.`,
    )
  }

  const { data: aperta } = await operatore
    .from('edizioni')
    .select('id')
    .eq('stato', 'aperta')
    .maybeSingle()
  if (!aperta) {
    throw new Error('Nessuna edizione aperta: aprila dall app con l account del capo.')
  }

  const { data: gia } = await operatore.from('vendite').select('id').limit(1)
  if (gia && gia.length > 0) return

  // Nessuna vendita ancora: la cassa non esiste, quindi la registra la suite
  // passando dalla stessa funzione che userebbe il telefono.
  const { data: prodotto } = await operatore
    .from('prodotti')
    .select('id')
    .not('prezzo_cent', 'is', null)
    .eq('nascosto', false)
    .limit(1)
    .maybeSingle()
  if (!prodotto) {
    throw new Error('Il menu dell edizione aperta non ha prodotti con prezzo.')
  }

  const { error } = await operatore.rpc('registra_vendite', {
    p_righe: [
      {
        id: crypto.randomUUID(),
        prodotto_id: prodotto.id,
        quantita: 1,
        gesto_id: crypto.randomUUID(),
        ordine_id: crypto.randomUUID(),
        dentro_offerta: false,
        registrato_il: new Date().toISOString(),
      },
    ],
  })
  if (error) throw new Error(`Vendita di partenza non registrata: ${error.message}`)
}

beforeAll(async () => {
  const url = obbligatoria('VITE_SUPABASE_URL')
  const anon = obbligatoria('VITE_SUPABASE_ANON_KEY')

  // Depositi separati, altrimenti i due client si scambiano il tesserino.
  // supabase-js salva la sessione in localStorage sotto una chiave che dipende
  // solo dal progetto: con due client sullo stesso progetto, l'accesso
  // dell'operatore finisce anche nel client "anonimo", che da quel momento
  // legge come autenticato. I test sull'anonimo passerebbero da rossi senza
  // che nulla sia aperto davvero — ed e' esattamente cosa e' successo la prima
  // volta che questa suite ha girato.
  const isolato = (nome: string) => ({
    auth: { storageKey: `prova-${nome}`, persistSession: false, autoRefreshToken: false },
  })

  anonimo = createClient(url, anon, isolato('anonimo'))
  operatore = createClient(url, anon, isolato('operatore'))
  const { error } = await operatore.auth.signInWithPassword({
    email: obbligatoria('TEST_OPERATORE_EMAIL'),
    password: obbligatoria('TEST_OPERATORE_PASSWORD'),
  })
  if (error) throw new Error(`Login operatore di test fallito: ${error.message}`)

  await preparaIlCampo()
})

describe('un utente non autenticato', () => {
  it('non legge il listino', async () => {
    const { data } = await anonimo.from('prodotti').select('*')
    expect(data ?? []).toHaveLength(0)
  })

  it('non legge le vendite', async () => {
    const { data } = await anonimo.from('vendite').select('*')
    expect(data ?? []).toHaveLength(0)
  })

  it('non puo chiamare le funzioni di scrittura', async () => {
    // Chiunque trovi l'URL ha anche la chiave anon: se l'execute non fosse
    // revocato, si registrerebbe e si stornerebbe senza nemmeno un account.
    for (const funzione of ['registra_vendite', 'storna_vendite']) {
      const { error } = await anonimo.rpc(funzione, { p_righe: [] })
      expect(error, `${funzione} risponde a un anonimo`).not.toBeNull()
    }
    const { error: erroreApri } = await anonimo.rpc('apri_edizione', {
      p_edizione: '00000000-0000-0000-0000-000000000000',
    })
    expect(erroreApri).not.toBeNull()
  })
})

describe('un operatore', () => {
  it('non puo promuoversi a capo', async () => {
    const { data: me } = await operatore.from('profiles').select('id').eq('id', uid).single()

    // La RLS può respingere in due modi: errore esplicito, oppure zero righe
    // toccate. Il test non deve prevedere quale dei due — deve verificare
    // l'unica cosa che conta, cioè che il ruolo non sia cambiato.
    await operatore.from('profiles').update({ role: 'capo' }).eq('id', me!.id)

    const { data: dopo } = await operatore.from('profiles').select('role').eq('id', uid).single()
    expect(dopo!.role).toBe('operatore')
  })

  it('non puo cambiare un prezzo di listino', async () => {
    const { data: prima } = await operatore
      .from('prodotti').select('id, prezzo_cent').not('prezzo_cent', 'is', null).limit(1).single()

    await operatore.from('prodotti').update({ prezzo_cent: 1 }).eq('id', prima!.id)

    const { data: dopo } = await operatore
      .from('prodotti').select('prezzo_cent').eq('id', prima!.id).single()
    expect(dopo!.prezzo_cent).toBe(prima!.prezzo_cent)
  })

  it('non puo inserire una vendita a mano scavalcando il menu', async () => {
    // E' la ragione per cui l'insert diretto e' revocato: qui si scriverebbe
    // un aperol da un centesimo senza passare da nessun controllo.
    const { data: ediz } = await operatore
      .from('edizioni').select('id').eq('stato', 'aperta').single()
    const { data: prod } = await operatore.from('prodotti').select('id').limit(1).single()
    const { data: me } = await operatore.from('profiles').select('id').eq('id', uid).single()

    const idFinto = crypto.randomUUID()
    const { error } = await operatore.from('vendite').insert({
      id: idFinto,
      edizione_id: ediz!.id,
      prodotto_id: prod!.id,
      quantita: 1,
      prezzo_cent: 1,
      ordine_id: crypto.randomUUID(),
      gesto_id: crypto.randomUUID(),
      operatore_id: me!.id,
      registrato_il: new Date().toISOString(),
    })
    expect(error).not.toBeNull()

    const { data: infilato } = await operatore
      .from('vendite').select('id').eq('id', idFinto)
    expect(infilato ?? []).toHaveLength(0)
  })

  it('non puo modificare il prezzo di una vendita gia registrata', async () => {
    // Riscrivere il prezzo e' piu' silenzioso che cancellare la riga: la riga
    // resta al suo posto e nessun conteggio segnala il buco.
    const { data: prima } = await operatore
      .from('vendite').select('id, prezzo_cent')
      .limit(1).single()

    await operatore.from('vendite').update({ prezzo_cent: 1 }).eq('id', prima!.id)

    const { data: dopo } = await operatore
      .from('vendite').select('prezzo_cent').eq('id', prima!.id).single()
    expect(dopo!.prezzo_cent).toBe(prima!.prezzo_cent)
  })

  it('non puo cancellare una vendita', async () => {
    const { data: prima } = await operatore.from('vendite').select('id').limit(1).single()
    await operatore.from('vendite').delete().eq('id', prima!.id)
    const { data: ancora } = await operatore
      .from('vendite').select('id').eq('id', prima!.id)
    expect(ancora ?? []).toHaveLength(1)
  })

  it('non puo aprire ne chiudere un edizione', async () => {
    // Aprire un edizione a novembre rimetterebbe in scrittura uno storico
    // gia' chiuso; chiuderla a meta' serata fermerebbe la cassa.
    const { data: ediz } = await operatore
      .from('edizioni').select('id').eq('stato', 'aperta').single()

    const { error: erroreChiudi } = await operatore.rpc('chiudi_edizione')
    expect(erroreChiudi).not.toBeNull()

    const { data: ancoraAperta } = await operatore
      .from('edizioni').select('stato').eq('id', ediz!.id).single()
    expect(ancoraAperta!.stato).toBe('aperta')
  })
})

describe('registra_vendite', () => {
  it('ignora il prezzo inviato dal client', async () => {
    const { data: prod } = await operatore
      .from('prodotti').select('id, prezzo_cent')
      .not('prezzo_cent', 'is', null).eq('nascosto', false).limit(1).single()

    const id = crypto.randomUUID()
    const { error } = await operatore.rpc('registra_vendite', {
      p_righe: [{
        id,
        prodotto_id: prod!.id,
        quantita: 1,
        gesto_id: crypto.randomUUID(),
        ordine_id: crypto.randomUUID(),
        dentro_offerta: false,
        registrato_il: new Date().toISOString(),
        prezzo_cent: 1,
      }],
    })
    expect(error).toBeNull()

    const { data: scritto } = await operatore
      .from('vendite').select('prezzo_cent').eq('id', id).single()
    expect(scritto!.prezzo_cent).toBe(prod!.prezzo_cent)
  })

  it('non duplica una riga rinviata', async () => {
    // E' la proprieta' su cui poggia la coda offline: senza, una rete
    // instabile raddoppierebbe la serata.
    const { data: prod } = await operatore
      .from('prodotti').select('id')
      .not('prezzo_cent', 'is', null).eq('nascosto', false).limit(1).single()

    const riga = {
      id: crypto.randomUUID(),
      prodotto_id: prod!.id,
      quantita: 1,
      gesto_id: crypto.randomUUID(),
      ordine_id: crypto.randomUUID(),
      dentro_offerta: false,
      registrato_il: new Date().toISOString(),
    }

    const { data: prima } = await operatore.rpc('registra_vendite', { p_righe: [riga] })
    const { data: seconda } = await operatore.rpc('registra_vendite', { p_righe: [riga] })

    expect(prima).toBe(1)
    expect(seconda).toBe(0)
  })
})

describe('storna_vendite', () => {
  it('non lascia stornare la riga di un altro operatore', async (ctx) => {
    // Senza questo controllo chiunque potrebbe cancellare il lavoro di un
    // collega, e la traccia direbbe il nome sbagliato.
    const { data: me } = await operatore.from('profiles').select('id').eq('id', uid).single()
    const { data: altrui } = await operatore
      .from('vendite').select('id').neq('operatore_id', me!.id)
      .is('storna_id', null).limit(1)

    // Senza righe di un secondo operatore l'attacco fallirebbe per la ragione
    // sbagliata e il verde non proverebbe nulla: meglio un test saltato.
    if (!altrui || altrui.length === 0) {
      ctx.skip('serve almeno una vendita registrata da un altro operatore')
      return
    }

    const { error } = await operatore.rpc('storna_vendite', {
      p_righe: [{
        id: crypto.randomUUID(),
        storna_id: altrui[0].id,
        registrato_il: new Date().toISOString(),
      }],
    })
    expect(error).not.toBeNull()
  })
})
