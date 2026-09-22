import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CampoInline } from '../../src/guscio/CampoInline'

describe('CampoInline', () => {
  it('mostra il valore come bottone finché non lo si tocca', () => {
    render(<CampoInline valore="Spritz" etichetta="Nome del prodotto" onSalva={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Spritz/ })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('al tocco diventa un campo con dentro il valore', async () => {
    render(<CampoInline valore="Spritz" etichetta="Nome del prodotto" onSalva={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Spritz/ }))
    expect(screen.getByRole('textbox')).toHaveValue('Spritz')
  })

  it('salva su Invio', async () => {
    const onSalva = vi.fn()
    render(<CampoInline valore="Spritz" etichetta="Nome" onSalva={onSalva} />)
    await userEvent.click(screen.getByRole('button', { name: /Spritz/ }))
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), 'Spritz Aperol{Enter}')
    expect(onSalva).toHaveBeenCalledWith('Spritz Aperol')
  })

  it('Esc annulla e non salva', async () => {
    const onSalva = vi.fn()
    render(<CampoInline valore="Spritz" etichetta="Nome" onSalva={onSalva} />)
    await userEvent.click(screen.getByRole('button', { name: /Spritz/ }))
    await userEvent.type(screen.getByRole('textbox'), 'ino{Escape}')
    expect(onSalva).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Spritz/ })).toBeInTheDocument()
  })

  it('non salva se il valore non è cambiato', async () => {
    // Toccare per sbaglio e toccare altrove non deve produrre una scrittura.
    const onSalva = vi.fn()
    render(<CampoInline valore="Spritz" etichetta="Nome" onSalva={onSalva} />)
    await userEvent.click(screen.getByRole('button', { name: /Spritz/ }))
    await userEvent.tab()
    expect(onSalva).not.toHaveBeenCalled()
  })

  it('mostra un trattino quando è vuoto, per avere qualcosa da toccare', () => {
    render(<CampoInline valore="" etichetta="Prezzo" onSalva={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Prezzo/ })).toBeInTheDocument()
  })
})
