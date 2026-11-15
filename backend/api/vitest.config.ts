import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@libsql/client': path.resolve(__dirname, '../shared/node_modules/@libsql/client/lib/index.js'),
      'daftari-backend-shared': path.resolve(__dirname, '../shared/src'),
      'daftari-realtime/index': path.resolve(__dirname, '../realtime/src/index.ts'),
      'daftari-realtime/runtime': path.resolve(__dirname, '../realtime/src/runtime.ts'),
      'daftari-paymob-webhook/runtime': path.resolve(__dirname, '../paymob_webhook/src/runtime.ts'),
    },
  },
});
