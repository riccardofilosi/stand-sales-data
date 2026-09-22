import { describe, it, expect, vi } from 'vitest'
import { render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SospesoProvider, useSospeso } from '../../src/features/cassa/SospesoContext'

/** Sta al posto della Cassa: l'unica che sa se c'è una vendita per aria. */
function Scrittore() {
  const { impostaSospeso } = useSospeso()
  return (
    <button type="button" onClick={() => impostaSospeso(true)}>
      batti una riga
    </button>
  )
}

/** Sta al posto del Guscio, che deve saperlo senza conoscere la Cassa. */
function Lettore() {
  const { sospeso } = useSospeso()
  return <p>{sospeso ? 'in sospeso' : 'niente per aria'}</p>
}

describe('SospesoContext', () => {
  it('quello che scrive la Cassa lo legge il Guscio', () => {
    render(
      <SospesoProvider>
        <Lettore />
      </SospesoProvider>,
    )
    expect(screen.getByText('niente per aria')).toBeInTheDocument()
  })

  it('scrivere da una parte dell albero si vede dall altra', async () => {
    // È tutto il punto del contesto: la guardia su «Esci» sta in testata, la
    // distinta sta nel corpo, e nessuno dei due deve importare l'altro.
    render(
      <SospesoProvider>
        <Scrittore />
        <Lettore />
      </SospesoProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /batti una riga/i }))
    expect(screen.getByText('in sospeso')).toBeInTheDocument()
  })

  it('fuori dal provider lo dice invece di leggere un null', () => {
    // Senza il controllo, `useSospeso()` tornerebbe null e l'errore uscirebbe
    // molte righe più in là, dove non si capisce più da dove viene.
    const silenzia = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useSospeso())).toThrow(
      'useSospeso va usato dentro SospesoProvider',
    )
    silenzia.mockRestore()
  })
})
