import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  if (command === 'build' && !env.VITE_API_URL) {
    throw new Error('FATAL: VITE_API_URL environment variable is required for production builds.');
  }

  return {
    plugins: [react(), tailwindcss()],
  };
})
