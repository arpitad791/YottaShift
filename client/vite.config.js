import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const HOSTED_API = 'https://yotta-shift-api.vercel.app';
const LOCAL_API = 'http://localhost:3001';

// The dashboard calls the API directly: the hosted one by default, the local one (npm run api)
// with `--mode local-api`, or any address given in YOTTASHIFT_API.
// It imports the shared enum lists from ../src/domain, so the dev server may read the repo root.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __API_URL__: JSON.stringify(
      process.env.YOTTASHIFT_API ?? (mode === 'local-api' ? LOCAL_API : HOSTED_API),
    ),
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
  },
}));
