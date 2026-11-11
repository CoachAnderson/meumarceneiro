import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes compartilham uma transação; rodam em sequência num único worker.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
