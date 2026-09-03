import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/** Tests unitaires de la logique pure du client mobile (le serveur a sa propre suite). */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
