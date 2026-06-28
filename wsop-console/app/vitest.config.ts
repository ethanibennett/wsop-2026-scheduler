import { defineConfig } from 'vitest/config'

// Dedicated config (not vite.config.ts) so the PWA plugin doesn't load under
// test. Engine functions are pure — node env, no DOM needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
