import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['test/*.js'],
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright'
    }
  },
  build: {
    lib: {
      name: 'bsv2',
      entry: resolve(__dirname, 'entry.js'),
      formats: ['es', 'umd'],
        fileName: (format) => `bsv2.${format === 'es' ? 'mjs' : 'umd.js'}`
      },
      target: ['es2018', 'chrome87', 'firefox78', 'safari14'],
      sourcemap: true,
      minify: 'terser',
      terserOptions: {
        compress: {
          pure_funcs: ['console.log', 'console.info']
        },
        mangle: {
          reserved: ['Buffer', 'require', 'define']
        }
      }
  },
  plugins: [

  ]
})
