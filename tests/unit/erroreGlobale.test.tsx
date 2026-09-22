import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErroreGlobale } from '../../src/ErroreGlobale'

function Esplode(): never {
  throw new Error('boom')
}

describe('ErroreGlobale', () => {
  it('mostra i figli quando non c è errore', () => {
    render(
      <ErroreGlobale>
        <p>tutto bene</p>
      </ErroreGlobale>,
    )
    expect(screen.getByText('tutto bene')).toBeInTheDocument()
  })

  it('cattura un errore di render e mostra un messaggio invece dello schermo bianco', () => {
    const silenzia = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErroreGlobale>
        <Esplode />
      </ErroreGlobale>,
    )
    expect(screen.getByText(/qualcosa è andato storto/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ricarica/i })).toBeInTheDocument()
    silenzia.mockRestore()
  })
})
