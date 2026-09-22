// Impacchetta un intervallo di migrazioni in un solo file da incollare
// nell'SQL Editor di Supabase.
//
// Incollarle una alla volta è dieci occasioni di sbagliare ordine o di
// fermarsi a metà. Qui escono in un `begin`/`commit`: o passano tutte, o il
// database resta esattamente com'era. Un errore a metà non lascia uno schema
// mezzo vecchio e mezzo nuovo, che è lo stato da cui non si torna indietro.
//
//   node scripts/pacchetto-migrazioni.mjs 008 017

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CARTELLA = 'supabase/migrations'

const [da = '008', a = '999'] = process.argv.slice(2)

const file = (await readdir(CARTELLA))
  .filter((n) => n.endsWith('.sql'))
  .sort()
  .filter((n) => {
    const numero = n.slice(0, 3)
    return numero >= da && numero <= a
  })

if (file.length === 0) {
  console.error(`Nessuna migrazione fra ${da} e ${a} in ${CARTELLA}/`)
  process.exit(1)
}

const pezzi = await Promise.all(
  file.map(async (nome) => {
    const testo = await readFile(join(CARTELLA, nome), 'utf8')
    return `-- ${'='.repeat(74)}\n-- ${nome}\n-- ${'='.repeat(74)}\n\n${testo.trim()}\n`
  }),
)

// La 008 demolisce il modello vecchio, ma se nel pacchetto c'e' anche la 001
// il vecchio l'ha appena costruito il pacchetto stesso: non c'e' niente di
// preesistente da perdere, e avvisare griderebbe al lupo.
const demolisce = file.some((n) => n.startsWith('008')) && !file.some((n) => n.startsWith('001'))

const intestazione = [
  '-- Pacchetto generato da scripts/pacchetto-migrazioni.mjs',
  `-- Migrazioni incluse: ${file.join(', ')}`,
  '--',
  ...(demolisce
    ? [
        '-- ATTENZIONE: 008_demolizione.sql CANCELLA le tabelle del modello',
        '-- vecchio (products, sales, price_history, supplies, purchases,',
        '-- cost_categories, pending_changes) e tutto quello che contengono.',
        '-- Non è reversibile. Scarica un backup prima di eseguire.',
        '--',
      ]
    : []),
  '-- Tutto dentro una transazione: se una riga fallisce, non si applica',
  '-- niente e il database resta com era.',
  '',
  'begin;',
  '',
].join('\n')

const uscita = `supabase/pacchetto-${da}-${file.at(-1).slice(0, 3)}.sql`
await writeFile(uscita, `${intestazione}\n${pezzi.join('\n')}\ncommit;\n`)

console.log(`${file.length} migrazioni impacchettate in ${uscita}`)
console.log(file.map((n) => `  ${n}`).join('\n'))
