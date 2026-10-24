// Les tests de navigateur, a part de `npm test` : ils demandent Chromium et une page construite.
//
//   npm run construire   (une fois : le test ouvre dist/editeur-svg.html, il ne construit rien)
//   npm run e2e          (CHROMIUM_PATH=/chemin/vers/chromium si Playwright n'a pas le sien)
//
// Les specs s'appellent `*.e2e.ts` pour que la configuration de `npm test` (tests/**/*.test.ts) ne
// les voie jamais.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.ts'],
    // Un navigateur par fichier : on laisse deux fichiers tourner a la fois, pas plus, pour ne pas
    // affamer un petit runner (le rendu d'une vectorisation prend un coeur entier).
    pool: 'forks',
    poolOptions: { forks: { maxForks: 2, minForks: 1 } },
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
});
