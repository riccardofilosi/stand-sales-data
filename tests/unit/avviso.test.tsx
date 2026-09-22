import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avviso } from '../../src/guscio/Avviso'

describe('Avviso', () => {
  it('dice il messaggio e si annuncia come allarme', () => {
    render(<Avviso>La rete non risponde.</Avviso>)
    const avviso = screen.getByRole('alert')
    expect(avviso).toHaveTextContent('La rete non risponde.')
  })

  it('porta il segno accanto al rosso, che da solo non basta', () => {
    render(<Avviso>Qualcosa non va.</Avviso>)
    // Il badge è `aria-hidden`: si vede, non si legge. Il testo lo trova
    // comunque `textContent`, che ignora l'accessibilità.
    expect(screen.getByRole('alert').textContent).toContain('!')
  })

  it('nudo perde la plancia, perché sotto ce n è già una', () => {
    const { rerender } = render(<Avviso>Errore.</Avviso>)
    expect(screen.getByRole('alert')).toHaveClass('plancia')
    rerender(<Avviso nudo>Errore.</Avviso>)
    expect(screen.getByRole('alert')).not.toHaveClass('plancia')
  })
})
