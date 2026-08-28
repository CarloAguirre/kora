import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@kora/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@kora/core': resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: {
      // Los CSS Modules se procesan de verdad en los tests: así una aserción
      // sobre una clase comprueba la clase real y no una cadena inventada.
      modules: { classNameStrategy: 'non-scoped' },
    },
  },
});
