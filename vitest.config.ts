import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    alias: {
      '@shared': '/Users/witiko/Desktop/Claude/Coding/Pesto-Caption/src/shared',
    },
  },
})
