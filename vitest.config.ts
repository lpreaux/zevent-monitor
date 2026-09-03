import { defineConfig } from 'vitest/config';

/** Tests unitaires de la logique pure du client mobile (le serveur a sa propre suite). */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
