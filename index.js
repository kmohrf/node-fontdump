#!/usr/bin/env node

var cli = require("cli");
var fontdump = require("./src/fontdump");

cli.parse({
    target: ["t", "folder to save font files and css to", null, __dirname],
    web: ["w", "path prepended to font filenames in css src declarations"]
});

cli.main(function(args, options) {
    fontdump.dump({
        url: args[0],
        target_directory: options["target"],
        web_directory: options["web"]
    });
});
