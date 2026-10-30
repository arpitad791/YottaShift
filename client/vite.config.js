import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dashboard talks to the local API (npm run api) through this proxy, so no CORS is needed.
// It imports the shared enum lists from ../src/domain, so the dev server may read the repo root.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.YOTTASHIFT_API ?? 'http://localhost:3001' },
    fs: { allow: ['..'] },
  },
});
