#!/usr/bin/env node

var log = require("./src/log");
var winston = require("winston");
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

if(!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
    log.add(winston.transports.Console, {
        colorize: true,
        level: {
            1: "warn",
            2: "info",
            3: "debug"
        }[argv.verbose]
    });
}

require("./src/fontdump").dump({
    url: argv._[0],
    target_directory: argv.targetDirectory,
    web_directory: argv.webDirectory
});
