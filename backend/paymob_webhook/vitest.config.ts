import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/*.test.ts', 'src/**/__tests__/*.fuzz.test.ts', 'src/runtime.test.ts'],
    environment: 'node',
    pool: 'forks',
  },
  resolve: {
    alias: {
      'daftari-backend-shared': path.resolve(__dirname, '../shared/src'),
    },
  },
});
