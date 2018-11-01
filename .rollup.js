'use strict'

const babel = require('rollup-plugin-babel')
const json = require('rollup-plugin-json')

module.exports = {
  input: 'src/fontdump.js',
  output: {
    file: 'dist/fontdump.js',
    format: 'umd',
    name: require('./package.json').name
  },
  plugins: [json(), babel({
    babelrc: false,
    presets: [['@babel/preset-env', { modules: false }]],
    exclude: 'node_modules/**'
  })]
}
