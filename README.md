# fontdump

fontdump is a node module and command line program that processes stylesheets for @font-face rules,
downloads the fonts and saves them locally. The stylesheet is requested with multiple User-Agent
strings, so that a server that returns stylesheets based on different User-Agents returns all
font files and configurations.

fontdump is primarily written for and used with [Google Fonts](https://fonts.google.com/).

If you often find yourself:

 * downloading fonts for local developing
 * wondering about privacy
 
when using Google Fonts or similar services you may fontdump useful.

## Installation

Install fontdump with npm:

    npm install node-fontdump


## Usage

### Command Line Interface

fontdump comes with a simple cli.

Just pass a stylesheet URL:

    bin/fontdump.js "http://fonts.googleapis.com/css?family=Roboto:300"

There are a few options to configure fontdumps behaviour. Run `bin/fontdump.js --help` to see them. You can change the output directory, add a base path and increase the verbosity level in case of errors.

### API

You may also use the fontdump API. The fontdump module exposes a single function called `dump` that returns a Promise and accepts a config object.

You must pass the following options:

`url`: the URL to the stylesheet

`target_directory`: the directory font and css files should be saved to

`web_directory`: the path that should be prepended to the font file URL.



## License

see `LICENSE` file
