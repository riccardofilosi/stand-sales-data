import { describe, it, expect } from 'vitest'
import { messaggioErrore } from '../../src/lib/errori'

describe('messaggioErrore', () => {
  it('riconosce un nome di prodotto ripetuto', () => {
    expect(
      messaggioErrore({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "prodotti_edizione_id_nome_key"',
      }),
    ).toBe('C’è già una voce con questo nome nel menu.')
  })

  it('spiega perché una voce venduta non si elimina', () => {
    expect(
      messaggioErrore({
        code: '23503',
        message:
          'update or delete on table "prodotti" violates foreign key constraint "vendite_prodotto_id_fkey" on table "vendite"',
      }),
    ).toBe('Questa voce è già stata venduta: si nasconde, non si elimina.')
  })

  it('traduce il vincolo sulle offerte', () => {
    expect(messaggioErrore({ message: 'violates check constraint "prodotti_offerta_coerente"' }))
      .toBe('Un’offerta ha bisogno di quanti pezzi si scelgono e di che tipo.')
  })

  it('traduce il rifiuto della RLS in una frase che dice a chi chiedere', () => {
    expect(
      messaggioErrore({
        code: '42501',
        message: 'new row violates row-level security policy for table "prodotti"',
      }),
    ).toBe('Serve il permesso del capo.')
  })

  it('lascia passare i messaggi delle nostre funzioni', () => {
    // P0001 è il codice di un `raise exception` scritto da noi: quei testi
    // sono già in italiano e già rivolti a un umano. Riscriverli qui
    // significherebbe tenerli allineati in due posti.
    expect(messaggioErrore({ code: 'P0001', message: 'nessuna sessione aperta' })).toBe(
      'Nessuna sessione aperta.',
    )
  })

  it('non raddoppia la punteggiatura', () => {
    expect(messaggioErrore({ code: 'P0001', message: 'il listino e vuoto.' })).toBe(
      'Il listino e vuoto.',
    )
  })

  it('riconosce la rete assente', () => {
    expect(messaggioErrore(new TypeError('Failed to fetch'))).toBe(
      'Nessuna rete. Riprova quando torna la linea.',
    )
  })

  it('ripiega su una frase generica invece di mostrare Postgres', () => {
    expect(
      messaggioErrore({ code: '22P02', message: 'invalid input syntax for type uuid: "x"' }),
    ).toBe('Qualcosa è andato storto. Riprova.')
  })

  it('regge il nulla', () => {
    expect(messaggioErrore(null)).toBe('Qualcosa è andato storto. Riprova.')
    expect(messaggioErrore(undefined)).toBe('Qualcosa è andato storto. Riprova.')
  })
})
