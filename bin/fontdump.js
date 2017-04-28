#!/usr/bin/env node

"use strict";

const fs = require("fs");

const winston = require("winston");
const assert = require("assert");
const is_url = require("is-url");
const program = require("commander");

const pkg = require("../package.json");
const fontdump = require("../dist/fontdump");

// configure cli
program
    .version(pkg.version)
    .usage("[options] <url>")
    .option("-v, --verbose", "verbosity level. repeatable", (v, total) => total + 1, 0)
    .option("-t, --target-directory [dir]", "folder to save font files and css to", process.cwd())
    .option("-w, --web-directory [dir]", "path prepended to font filenames in css src declarations", "")
    .parse(process.argv);

// configure logger
winston.cli();
winston.level = ["error", "warn", "info", "debug"][Math.min(program.verbose || 0, 3)];

// add error handling
process.on("exit", function() { process.reallyExit(process.exitCode); });
process.on("uncaughtException", function(err) {
    winston.error(err.message);
    process.exitCode = 1;
});
process.on("unhandledRejection", function(err) {
    winston.error(err.message);
    process.exitCode = 1;
});

// assert cli options
assert(is_url(program.args[0]), "url to font is required first argument");
assert(fs.lstatSync(program.targetDirectory).isDirectory(), "target directory must be a directory");

// start the machines :)
fontdump.dump({
    url: program.args[0],
    target_directory: program.targetDirectory,
    web_directory: program.webDirectory
}).catch((err) => winston.error(err.message));
