import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  css: {
    postcss: { plugins: [] },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
