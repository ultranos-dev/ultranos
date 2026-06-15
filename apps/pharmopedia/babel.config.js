module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: { '@': './src' },
          extensions: ['.ios.js', '.android.js', '.native.ts', '.native.tsx', '.js', '.ts', '.tsx', '.json'],
        },
      ],
      // react-native-reanimated/plugin MUST be listed last
      'react-native-reanimated/plugin',
    ],
  }
}
