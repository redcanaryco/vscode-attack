'use strict';

const path = require('path');

/** @typedef {import('webpack').Configuration} WebpackConfig **/
/** @type WebpackConfig */
const webExtensionConfig = {
  mode: 'none',
  target: 'webworker',
  entry: {
    extension: './src/extension.ts'
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, './dist/web'),
    libraryTarget: 'commonjs',
    devtoolModuleFilenameTemplate: '../../[resource-path]',
    clean: true
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'],
    extensions: ['.ts', '.js'],
    alias: {},
    fallback: {
        buffer: false,
        http: false,
        https: false,
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }]
      }
    ]
  },
  plugins: [],
  externals: {
    vscode: 'commonjs vscode'
  },
  performance: {
    hints: false
  },
  devtool: 'nosources-source-map'
};
/** @type WebpackConfig */
const nodeExtensionConfig = {
  mode: 'none',
  target: 'node',
  entry: {
    extension: './src/extension.ts'
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, './dist/host'),
    libraryTarget: 'commonjs',
    devtoolModuleFilenameTemplate: '../../[resource-path]',
    clean: true
  },
  resolve: {
    mainFields: ['module', 'main'],
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }]
      }
    ]
  },
  plugins: [],
  externals: {
    vscode: 'commonjs vscode'
  },
  performance: {
    hints: false
  },
  devtool: 'nosources-source-map'
};

module.exports = [webExtensionConfig, nodeExtensionConfig];
