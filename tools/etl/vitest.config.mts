import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Sin esto, vitest también escanea `dist/` con su patrón por defecto y
    // recoge el `.spec.js` (CommonJS) ya compilado ahí, que no puede
    // `require()` un vitest ESM-only — ver apps/api/vitest.config.mts, que
    // ya restringe por el mismo motivo.
    include: ['src/**/*.spec.ts'],
  },
});
