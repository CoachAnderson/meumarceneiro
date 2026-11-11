import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // FC_RUNS=5000 npm test aumenta a quantidade de casos aleatórios por propriedade.
    setupFiles: ['./test/setup.ts'],
  },
});
