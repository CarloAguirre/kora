import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Los paquetes compartidos se compilan a CommonJS porque el backend
      // (NestJS) los consume así. Vite, en cambio, necesita ESM. En lugar de
      // publicar un doble empaquetado, el front consume el CÓDIGO FUENTE del
      // paquete y Vite lo compila junto con la aplicación: es el patrón de
      // "paquetes internos" de los monorepos, y además da recarga en caliente
      // al editar un contrato.
      '@kora/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@kora/core': resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  css: {
    modules: {
      // Nombres legibles en desarrollo (Componente_clase__hash) y cortos en
      // producción. Poder leer el nombre del componente en el inspector ahorra
      // mucho tiempo al depurar estilos.
      generateScopedName:
        process.env.NODE_ENV === 'production'
          ? '[hash:base64:6]'
          : '[name]__[local]__[hash:base64:4]',
    },
  },
  server: {
    port: 5173,
    proxy: {
      // El front habla con /api en su mismo origen y Vite lo reenvía a la API.
      // Así no hay CORS en desarrollo y la cookie del refresh token viaja como
      // en producción, donde ambos van tras el mismo dominio.
      //
      // "127.0.0.1" y no "localhost": la API de Nest escucha en `0.0.0.0`
      // (solo IPv4). Si otro proceso en la máquina tiene el puerto 3000
      // ocupado en IPv6 (`[::]:3000`), "localhost" puede resolver a `::1`
      // primero y el proxy le pega al servidor equivocado en vez de a esta API.
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
