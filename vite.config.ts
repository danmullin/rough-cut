import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // CI sets VITE_BASE=/rough-cut/ for GitHub Pages; local/dev stays at /.
  base: process.env.VITE_BASE ?? '/',
})
