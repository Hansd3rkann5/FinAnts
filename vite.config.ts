import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

function buildVersion(): string {
  try {
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim()
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    return `b${count} · ${sha}`
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react()],
  base: '/FinAnts/',
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
