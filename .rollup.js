"use strict";

const babel = require("rollup-plugin-babel");
const json = require("rollup-plugin-json");

module.exports = {
  entry: "src/fontdump.js",
  dest: "dist/fontdump.js",
  format: "umd",
  moduleName: require("./package.json").name,
  plugins: [ json(), babel() ]
};
