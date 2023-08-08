#!/usr/bin/env -S node --no-warnings

import fontdump from '../src/fontdump.mjs'
import winston from 'winston'
import assert from 'assert'
import isUrl from 'is-url'
import { Command } from 'commander'

import pkg from '../package.json' assert { type: 'json' }

const program = new Command('fontdump')

// configure cli
program
  .version(pkg.version)
  .usage('[options] <url>')
  .option('-v, --verbose', 'verbosity level. repeatable', (v, total) => total + 1, 0)
  .option('-t, --target-directory [dir]', 'folder to save font files and css to', process.cwd())
  .option('-w, --web-directory [dir]', 'path prepended to font filenames in css src declarations', '')
  .option('-l, --include-legacy-formats', 'include legacy formats like eot, svg and ttf fonts', false)
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

// start the machines :)
const options = program.opts()
fontdump({
  logger,
  url: program.args[0],
  includeLegacyFormats: options.includeLegacyFormats,
  targetDirectory: options.targetDirectory,
  webDirectory: options.webDirectory
}).catch((err) => logger.error(err.message))
