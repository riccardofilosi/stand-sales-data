import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Testing Library smonta da sola solo quando vitest gira con `globals: true`.
// Qui i test importano describe/it/expect esplicitamente, quindi la pulizia va
// registrata a mano: senza, il secondo `render` di un file trova ancora in
// pagina il primo, e ogni `getBy*` fallisce per elementi duplicati.
afterEach(cleanup)
