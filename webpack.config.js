const path = require('path')
const webpack = require('webpack')
const pkg = require('./package.json')

module.exports = [
  {
    entry: './entry.js',
    target: 'web',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bsv.bundle.js',
      library: {
        name: 'bsv',
        type: 'umd2'
      }
    },
    resolve: {
      fallback:{
          buffer: require.resolve('buffer/'),
      },
      alias: {
        process: 'process/browser'
      }
    },
    plugins: [
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: [require.resolve("buffer/"), "Buffer"],
      })
    ],
    devtool: 'source-map',
    mode: 'production'
  },
  {
    entry: './entry.js',
    target: 'node',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bsv.module.js',
      library: {
        type: 'commonjs-module'
      }
    },
    devtool: 'source-map',
    mode: 'production'
  },
  {
    entry: './entry.js',
    target: 'node',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bsv.cjs.js',
      library: {
        type: 'commonjs2'
      }
    },
    devtool: 'source-map',
    mode: 'production'
  }
]
