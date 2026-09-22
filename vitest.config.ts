import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

// Le credenziali della suite di attacco stanno in .env.test.local, che non e'
// committato. `loadEnv` con prefisso vuoto carica anche le variabili senza
// prefisso VITE_, come TEST_OPERATORE_EMAIL.
const env = loadEnv('test', process.cwd(), '')

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/security/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    env,
  },
})
