import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pastiglie, PillStato, Testata } from '../../src/guscio/Guscio'

describe('Testata', () => {
  it('mostra il titolo e torna indietro al primo tocco', async () => {
    const u = userEvent.setup()
    const onIndietro = vi.fn()
    render(<Testata titolo="Sagra 2026" onIndietro={onIndietro} />)

    expect(screen.getByText('Sagra 2026')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Indietro' }))
    expect(onIndietro).toHaveBeenCalledOnce()
  })

  it('con un ordine non registrato il primo tocco avvisa, il secondo esce', async () => {
    // È la freccia della cassa: uscire smonta la griglia e l'ordine battuto
    // si perde. Il primo tocco arma — rosso, col motivo scritto — e solo il
    // secondo esce davvero.
    const u = userEvent.setup()
    const onIndietro = vi.fn()
    render(<Testata titolo="Cassa" onIndietro={onIndietro} costaUscire />)

    await u.click(screen.getByRole('button', { name: 'Indietro' }))
    expect(onIndietro).not.toHaveBeenCalled()
    expect(screen.getByText(/Ordine non registrato/)).toBeInTheDocument()

    await u.click(screen.getByRole('button'))
    expect(onIndietro).toHaveBeenCalledOnce()
  })

  it('l avviso si disarma da solo se nessuno risponde', async () => {
    // `fireEvent`, non `userEvent`: con gli orologi finti userEvent aspetta
    // pause che non scorrono mai, e il test scade invece di finire.
    vi.useFakeTimers()
    try {
      render(<Testata titolo="Cassa" onIndietro={vi.fn()} costaUscire />)

      fireEvent.click(screen.getByRole('button', { name: 'Indietro' }))
      expect(screen.getByText(/Ordine non registrato/)).toBeInTheDocument()

      await act(() => vi.advanceTimersByTimeAsync(5000))
      expect(screen.queryByText(/Ordine non registrato/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Pastiglie', () => {
  it('a edizione aperta sono tutte accese e un tocco cambia sezione', async () => {
    const u = userEvent.setup()
    const vaiA = vi.fn()
    render(<Pastiglie stato="aperta" sezione="andamento" vaiA={vaiA} />)

    await u.click(screen.getByRole('button', { name: 'Menu' }))
    expect(vaiA).toHaveBeenCalledWith('listino')
  })

  it('segna qual è la sezione in cui ci si trova', () => {
    render(<Pastiglie stato="aperta" sezione="listino" vaiA={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('in bozza la cassa è spenta e il motivo sta nel nome, non solo nel grigio', () => {
    render(<Pastiglie stato="bozza" sezione="listino" vaiA={vi.fn()} />)
    const cassa = screen.getByRole('button', { name: /Cassa —/ })
    expect(cassa).toBeDisabled()
  })

  it('a edizione chiusa l andamento resta leggibile', () => {
    render(<Pastiglie stato="chiusa" sezione="andamento" vaiA={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Andamento' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Cassa —/ })).toBeDisabled()
  })
})

describe('PillStato', () => {
  it('scrive lo stato per esteso: il colore da solo non basta', () => {
    render(<PillStato stato="aperta" />)
    expect(screen.getByText('aperta')).toBeInTheDocument()
  })

  it('traduce "bozza" in un testo più chiaro', () => {
    render(<PillStato stato="bozza" />)
    expect(screen.getByText('in preparazione')).toBeInTheDocument()
  })
})
