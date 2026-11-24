import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      buffer: 'buffer',
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      process: 'process/browser',
      string_decoder: 'string_decoder',
    },
    dedupe: ['bn.js'],
  },
  define: {
    'process.env': {},
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'entry.js'),
      name: 'bsv2',
      fileName: (format) => {
        if (format === 'es') return 'bsv2.mjs';
        if (format === 'cjs') return 'bsv2.cjs';
        return `bsv2.${format}.js`;
      },
      formats: ['cjs', 'es', 'umd'],
    },
    rollupOptions: {
      output: {
        // standalone bundle for UMD
      },
    },
    minify: 'esbuild',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: ['test/**/*.js'],
    exclude: ['test/data/**', 'test/vectors/**', 'test/vitest.setup.js', 'test/global.js'],
    setupFiles: ['./test/vitest.setup.js'],
  },
});
