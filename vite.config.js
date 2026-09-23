import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project-site deploy: everything is served under /Games-App/
export default defineConfig({
  base: '/Games-App/',
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets' }
})
