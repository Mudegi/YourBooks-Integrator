import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 19093,
    proxy: {
      // Proxy API + webhook test calls to the Express server in dev.
      '/api': 'http://localhost:19092',
    },
  },
});
