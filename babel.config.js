module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    '@babel/plugin-transform-export-namespace-from',
    '@babel/plugin-transform-class-static-block',
    [
      'module-resolver',
      {
        // Bare package names must resolve from node_modules. A src root would
        // redirect `realm` to src/realm and create a circular database import.
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
          '@/components': './src/components',
          '@/screens': './src/screens',
          '@/navigation': './src/navigation',
          '@/store': './src/store',
          '@/services': './src/services',
          '@/hooks': './src/hooks',
          '@/utils': './src/utils',
          '@/styles': './src/styles',
          '@/types': './src/types',
          '@/assets': './src/assets',
        },
      },
    ],
  ],
};
