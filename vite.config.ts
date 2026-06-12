import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import type { Plugin, ViteDevServer } from 'vite'

function buildVersion(): string {
  try {
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim()
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    return `b${count} · ${sha}`
  } catch {
    return 'dev'
  }
}

function devVersionPlugin(): Plugin {
  const versionFile = path.resolve(__dirname, '.dev-version')
  let version = 0

  try {
    version = parseInt(fs.readFileSync(versionFile, 'utf-8').trim(), 10) || 0
  } catch { /* first run */ }

  const VIRTUAL_ID = 'virtual:dev-version'
  const RESOLVED_ID = '\0virtual:dev-version'
  let server: ViteDevServer

  return {
    name: 'dev-version',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id === RESOLVED_ID) return `export const DEV_VERSION = ${version}`
    },
    configureServer(s) {
      server = s
    },
    handleHotUpdate({ file }) {
      if (file.includes('node_modules') || file.endsWith('.dev-version')) return
      version++
      fs.writeFileSync(versionFile, String(version))
      const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
      if (mod) server.moduleGraph.invalidateModule(mod)
    },
  }
}

export default defineConfig({
  plugins: [react(), devVersionPlugin()],
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
