module.exports = function(api) {
  api.cache(true)
  let presets = []
  let plugins = []

  switch ( process.env['NODE_ENV'] ) {
    case 'test':
      presets = [
        [
          '@babel/preset-env',
          {
            targets: {
              node: 'current',
            },
          },
        ],
      ]
      plugins = [
        'babel-plugin-transform-import-meta',
        '@babel/plugin-proposal-export-default-from',
        '@babel/plugin-syntax-import-assertions'
      ]
      break
    default:
      presets = [
        [
          '@babel/preset-env',
          {
            modules: false, //Setting this to false will preserve ES services
            targets: {
              node: 'current',
            },
          },
        ],
      ]
      plugins = ['@babel/plugin-syntax-import-assertions']
      break
  }

  return {
    presets,
    plugins,
  }
}