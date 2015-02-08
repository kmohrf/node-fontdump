#!/usr/bin/env node

var yargs = require("yargs")
        .alias("v", "verbose")
        .boolean("v")
        .count("v")
        .alias("t", "target-directory")
        .describe("t", "folder to save font files and css to")
        .default("t", __dirname)
        .alias("w", "web-directory")
        .describe("w", "path prepended to font filenames in css src declarations")
        .default("w", "")
        .required(0, "please provide a font css url")
    ;
var argv = yargs.argv;

    });
require("./src/fontdump").dump({
    url: argv._[0],
    target_directory: argv.targetDirectory,
    web_directory: argv.webDirectory
});
