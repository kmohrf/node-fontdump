#!/usr/bin/env node

'use strict'

const fs = require('fs')

const winston = require('winston')
const assert = require('assert')
const isUrl = require('is-url')
const program = require('commander')

const pkg = require('../package.json')
const fontdump = require('../dist/fontdump')

// configure cli
program
  .version(pkg.version)
  .usage('[options] <url>')
  .option('-v, --verbose', 'verbosity level. repeatable', (v, total) => total + 1, 0)
  .option('-t, --target-directory [dir]', 'folder to save font files and css to', process.cwd())
  .option('-w, --web-directory [dir]', 'path prepended to font filenames in css src declarations', '')
  .parse(process.argv)

// configure logger
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.label({ label: pkg.name }),
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(function (logEntry) {
      return `${logEntry.level}: ${logEntry.message}`
    })
  ),
  level: ['error', 'warn', 'info', 'debug'][Math.min(program.verbose || 0, 3)],
  transports: [new winston.transports.Console()]
})

// add error handling
process.on('exit', function () { process.reallyExit(process.exitCode) })
process.on('uncaughtException', function (err) {
  logger.error(err.message)
  process.exitCode = 1
})
process.on('unhandledRejection', function (err) {
  logger.error(err.message)
  process.exitCode = 1
})

// assert cli options
assert(isUrl(program.args[0]), 'url to font is required first argument')
assert(fs.lstatSync(program.targetDirectory).isDirectory(), 'target directory must be a directory')

// start the machines :)
fontdump({
  logger: logger,
  url: program.args[0],
  targetDirectory: program.targetDirectory,
  webDirectory: program.webDirectory
}).catch((err) => logger.error(err.message))
