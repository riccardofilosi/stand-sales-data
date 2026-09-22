import type { ReactNode } from 'react'

/**
 * Come si vede un errore. Uno solo per tutta l'app: chi cade in una sezione
 * riconosce la faccia dell'errore anche nelle altre, senza doverla imparare
 * di nuovo ogni volta.
 *
 * Plancia, segno e parola. Il segno c'è perché il rosso da solo non basta —
 * circa un uomo su dodici non lo distingue. Il fondo del badge è il rosso
 * DIPINTO, che resta scuro: ci si scrive sopra in bianco.
 *
 * `nudo` toglie la superficie, per quando l'avviso vive già dentro una
 * plancia: una plancia dentro una plancia si vede e non dice niente in più.
 */
export function Avviso({ children, nudo = false }: { children: ReactNode; nudo?: boolean }) {
  return (
    <p
      role="alert"
      className={`flex items-start gap-3 text-[14px] ${nudo ? '' : 'plancia p-4'}`}
      style={{ color: 'var(--rosso)' }}
    >
      <span
        aria-hidden="true"
        className="shrink-0 grid place-items-center w-6 h-6 rounded-[7px] font-bold text-[14px]"
        style={{ background: 'var(--rosso-fondo)', color: '#fff' }}
      >
        !
      </span>
      <span>{children}</span>
    </p>
  )
}
