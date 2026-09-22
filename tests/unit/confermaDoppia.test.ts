import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useConfermaDoppia } from '../../src/lib/confermaDoppia'

describe('useConfermaDoppia', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('parte disarmato', () => {
    const { result } = renderHook(() => useConfermaDoppia())
    expect(result.current.armato).toBe(false)
  })

  it('il primo tocco arma', () => {
    const { result } = renderHook(() => useConfermaDoppia())
    act(() => result.current.arma())
    expect(result.current.armato).toBe(true)
  })

  it('si disarma da solo dopo la scadenza', () => {
    const { result } = renderHook(() => useConfermaDoppia(4000))
    act(() => result.current.arma())
    act(() => vi.advanceTimersByTime(4000))
    expect(result.current.armato).toBe(false)
  })

  it('disarma resetta subito', () => {
    const { result } = renderHook(() => useConfermaDoppia())
    act(() => result.current.arma())
    act(() => result.current.disarma())
    expect(result.current.armato).toBe(false)
  })
})
