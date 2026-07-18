import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests unitaires uniquement (le self-test d'integration reste sur `npm test`).
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
  },
});
