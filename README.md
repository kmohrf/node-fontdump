# fontdump

fontdump is a node module and command line program that processes stylesheets for @font-face rules,
downloads the fonts and saves them locally.
The resulting fontdump stylesheet uses the good ol' ['bulletproof'](https://calendar.perfplanet.com/2016/no-font-face-bulletproof-syntax/) @font-face declaration syntax and includes `unicode-range` and `font-display` properties if provided by the source.

Since version 3.0 only `woff` and `woff2` files are downloaded by default. If you want to download legacy web font formats like `eot`, `ttf`, or `svg` pass the `--include-legacy-formats` option.

fontdump is primarily written for and used with [Google Fonts](https://fonts.google.com/).

If you often find yourself:

 * downloading fonts for local development
 * wondering about privacy
 
when using Google Fonts or similar services you may find fontdump useful.

## Installation

Install via npm/yarn:

```sh
# via npm
npm install node-fontdump
# via yarn
yarn add node-fontdump
```

## Usage

### Command Line Interface

fontdump comes with a simple cli.

Just pass a stylesheet URL:

```sh
bin/fontdump.js "http://fonts.googleapis.com/css?family=Roboto:300"
```

There are a few options to configure the behaviour of fontdump. Run `bin/fontdump.js --help` to see them. You can change the output directory, add a base path and increase the verbosity level in case of errors.

### API

You may also use the fontdump API. The fontdump module exposes a function that returns a Promise and accepts a config object.

You may pass the following options:

`logger`: a logger instance (uses `console` by default, but this might be very verbose)

You must pass the following options:

`url`: the URL to the stylesheet

`targetDirectory`: the directory font and css files should be saved to

`webDirectory`: the path that should be prepended to the font file URL.

`includeLegacyFormats`: when truthy fontdump will download legacy formats like EOT, SVG, and TTF.



## License

Licensed under the terms of the ISC license. See the `LICENSE` file.
