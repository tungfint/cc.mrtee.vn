import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, '../..', '');
  return {
    plugins: [react(), tailwindcss()],
    envDir: '../..',
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${environment.API_PORT || '3000'}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test-setup.ts',
    },
  };
});
