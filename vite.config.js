/// <reference types="vitest" />
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['test/*.js']
  },
  build: {
    lib: {
      name: 'bsv2',
      entry: resolve(__dirname, 'entry.js'),
      formats: ['es', 'umd'],
        fileName: (format) => `bsv2.${format === 'es' ? 'mjs' : 'umd.js'}`
      }
  },
  plugins: [
    nodePolyfills({
      include: ['buffer', 'global'],
      exclude: ['http', 'vm', 'process', 'fs', 'path'],
      globals: { Buffer: true, global: true },
      protocolImports: true
    })
  ]
})
