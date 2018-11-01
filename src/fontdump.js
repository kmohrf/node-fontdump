const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const Promise = require('es6-promise').Promise
const request = require('request-promise')
const logger = require('winston')
const _ = require('lodash')
const css = require('css')

function hash (data) {
  return crypto.createHash('md5').update(data).digest('hex')
}

function stripQuotes (string, quotationStyle = "'") {
  if (string.indexOf(quotationStyle) === 0 && string.lastIndexOf(quotationStyle) === string.length - 1) {
    return string.slice(1, -1)
  }

  return string
}

const FontSource = function (font, source, extension, format) {
  this.font = font
  this.source = source
  this.extension = extension
  this.format = format
}

FontSource.prototype = {
  getFilename: function () {
    const range = this.font.unicodeRange ? hash(this.font.unicodeRange) : 'default'
    return `${this.font.family.name}_${this.font.weight}_${this.font.style}_${range}.${this.extension}`
      .replace(/\s+/, '').toLowerCase()
  },
  getWebFilename: function () {
    const filename = this.getFilename()

    if (this.format !== 'svg') {
      return filename
    }

    const hashPos = this.source.indexOf('#')
    return filename + (hashPos !== -1 ? this.source.substr(hashPos) : '')
  }
}

const Font = function (family, weight, style, unicodeRange) {
  this.family = family
  this.weight = weight
  this.style = style
  this.unicodeRange = unicodeRange
  this.sources = {}
}

Font.prototype = {
  addSource: function (source, extension, format) {
    this.sources[format] = new FontSource(this, source, extension, format)
    return this
  },
  getSources: function () {
    return _.values(this.sources)
  },
  hasFormat: function (format) {
    return _.has(this.sources, format)
  },
  getSource: function (format) {
    return this.sources[format]
  }
}

Font.FORMATS = {
  'woff2': 'woff2',
  'woff': 'woff',
  'truetype': 'ttf',
  'embedded-opentype': 'eot',
  'svg': 'svg'
}

const FontFamily = function (name) {
  this.name = name
  this.fonts = {}

  this._createFontId = function (weight, style, unicodeRange) {
    return `${weight}_${style}_${hash(unicodeRange || '')}`
  }
}

FontFamily.prototype = {
  getFonts: function () {
    return _.values(this.fonts)
  },
  withFont: function (weight, style, unicodeRange) {
    const id = this._createFontId(weight, style, unicodeRange)

    if (typeof this.fonts[id] === 'undefined') {
      this.fonts[id] = new Font(this, weight, style, unicodeRange)
    }

    return this.fonts[id]
  }
}

const FontFamilyCollection = function () {
  this.families = {}
}

FontFamilyCollection.prototype = {
  syncFonts: function (synchronizer) {
    const syncs = this.getFontSources().map(function (fontSource) {
      return synchronizer(fontSource.source, fontSource.getFilename())
    })

    return Promise.all(syncs)
  },
  getFamilies: function () {
    return _.values(this.families)
  },
  getFonts: function () {
    return Array.prototype.concat.apply([], this.getFamilies().map(function (family) {
      return family.getFonts()
    }))
  },
  getFontSources: function () {
    return Array.prototype.concat.apply([], this.getFonts().map(function (font) {
      return font.getSources()
    }))
  },
  withFontFamily: function (name) {
    if (typeof this.families[name] === 'undefined') {
      this.families[name] = new FontFamily(name)
    }

    return this.families[name]
  }
}

const FontLoader = function (endpoint, targetDirectory) {
  const self = this

  this.agents = _.clone(FontLoader.AGENTS)
  this.endpoint = endpoint
  this.targetDirectory = targetDirectory

  this._createRequest = function (endpoint, ua, encoding) {
    const req = request({
      url: endpoint,
      encoding: typeof encoding === 'undefined' ? 'utf8' : null,
      headers: { 'User-Agent': ua || FontLoader.AGENTS.woff }
    })

    req.then(function () {
      // on success
      logger.debug(`successfully downloaded '${endpoint}' with ua '${ua}'`)
    }, function (err) {
      // on error
      logger.error(`error while downloading '${endpoint}' with ua '${ua}'`, err)
    })

    return req
  }

  this._loadStylesheets = function () {
    const requests = _.values(this.agents).map(function (ua) {
      return self._createRequest(self.endpoint, ua)
    })

    return Promise.all(requests)
  }

  this._parseStylesheet = function (collection, stylesheet) {
    css.parse(stylesheet).stylesheet.rules.forEach(function (rule) {
      if (rule.type !== 'font-face') return

      const declarations = _.keyBy(rule.declarations, 'property')
      const weight = declarations['font-weight']['value']
      const style = declarations['font-style']['value']
      const sourceMatches = declarations['src']['value']
        .match(/(url\((http.+)\) format\('(.+)'\)|url\((http.+.eot)\))/)
      const source = sourceMatches[2] ? sourceMatches[2] : sourceMatches[4]
      const format = sourceMatches[2] ? sourceMatches[3] : 'embedded-opentype'
      const extension = Font.FORMATS[format]
      const unicodeRange = _.has(declarations, 'unicode-range') ? declarations['unicode-range']['value'] : null
      const family = stripQuotes(declarations['font-family']['value'])

      logger.debug(`adding font ${family} with weight ${weight} and style ${style}`)

      collection
        .withFontFamily(family)
        .withFont(weight, style, unicodeRange)
        .addSource(source, extension, format)
    })
  }

  this._parseStylesheets = function (stylesheets) {
    logger.info('parsing stylesheets')
    return new Promise(function (resolve) {
      const collection = new FontFamilyCollection()
      stylesheets.forEach(this._parseStylesheet.bind(this, collection))
      resolve(collection)
    }.bind(this))
  }

  this._writeFont = function (targetFile, data) {
    return new Promise(function (resolve, reject) {
      fs.writeFile(targetFile, data, function (err) {
        if (err) reject(err)
        else resolve(targetFile)
      })
    })
  }

  this._syncFont = function (fontSource, filename) {
    const targetFile = path.join(this.targetDirectory, filename)

    return this
      ._createRequest(fontSource, null, null)
      .then(this._writeFont.bind(this, targetFile))
  }

  this._syncFonts = function (collection) {
    logger.info('syncing fonts')
    return collection
      .syncFonts(this._syncFont.bind(this))
      .then(function () {
        return new Promise(function (resolve) {
          resolve(collection)
        })
      }, function (err) {
        logger.error('could not sync font', err)
      })
  }
}

FontLoader.prototype = {
  requestAll: function () {
    return this._loadStylesheets()
      .then(this._parseStylesheets.bind(this))
      .then(this._syncFonts.bind(this))
  },
  disableFormat: function (definitionName) {
    if (_.has(this.agents, definitionName)) {
      delete this.agents[definitionName]
    } else {
      throw new Error('no definition with that name or you’ve already disabled it')
    }

    return this
  }
}

FontLoader.AGENTS = {
  'woff2': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.106 Safari/537.36',
  'woff': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/30.0.1599.101 Safari/537.36',
  'ttf': 'Mozilla/5.0 (Linux; U; Android 2.2; en-us; DROID2 GLOBAL Build/S273) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1',
  'svg': 'Mozilla/5.0 (iPad; U; CPU OS 3_2 like Mac OS X; en-us) AppleWebKit/531.21.10 (KHTML, like Gecko) Version/4.0.4 Mobile/7B334b Safari/531.21.10',
  'eot': 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; .NET CLR 1.1.4322)'
}

const FontFaceRenderer = function (endpoint) {
  this.endpoint = endpoint

  this._createUrl = function (fontSource) {
    const url = this.endpoint
      ? this.endpoint + '/' + fontSource.getWebFilename()
      : fontSource.getWebFilename()

    return `url('${url}')`
  }

  this._addSourceSet = function (declarationSet, font) {
    if (font.hasFormat('embedded-opentype')) {
      this._addDeclaration(
        declarationSet, 'src',
        this._createUrl(font.getSource('embedded-opentype'))
      )
    }

    this._addDeclaration(declarationSet, 'src', font.getSources().map(function (source) {
      return `${this._createUrl(source)} format('${source.format}')`
    }.bind(this)).join(', '))
  }

  this._addDeclaration = function (declarationSet, property, value) {
    declarationSet.push({
      type: 'declaration',
      property: property,
      value: value
    })
  }

  this._addRule = function (ruleset, font) {
    const rule = {
      type: 'font-face',
      declarations: []
    }

    this._addDeclaration(rule.declarations, 'font-family', "'" + font.family.name + "'")
    this._addDeclaration(rule.declarations, 'font-weight', font.weight)
    this._addDeclaration(rule.declarations, 'font-style', font.style)
    this._addSourceSet(rule.declarations, font)

    if (font.unicodeRange) {
      this._addDeclaration(rule.declarations, 'unicode-range', font.unicodeRange)
    }

    logger.debug(
      `adding font-face rule for font-family ${font.family.name} with weight ${font.weight} and 
            style ${font.style}${font.unicodeRange ? ' and unicode range ' + font.unicodeRange : ''}`
    )

    ruleset.push(rule)
  }

  this._buildAST = function (collection) {
    logger.info('building ast')

    const ast = {
      type: 'stylesheet',
      stylesheet: {
        rules: []
      }
    }

    collection.getFonts().map(this._addRule.bind(this, ast.stylesheet.rules))

    return ast
  }
}

FontFaceRenderer.prototype = {
  render: function (collection) {
    logger.info('rendering font-faces')
    const ast = this._buildAST(collection)
    return css.stringify(ast)
  }
}

module.exports = {
  logger: logger,
  dump: function (config) {
    return new Promise(function (resolve, reject) {
      if (!_.has(config, 'url')) {
        throw new Error('url is mandatory')
      }

      if (!_.has(config, 'targetDirectory')) {
        throw new Error('target directory is mandatory')
      }

      if (!_.has(config, 'cssFile')) {
        config.cssFile = 'fonts.css'
      }

      const loader = new FontLoader(config.url, config.targetDirectory)
      const renderer = new FontFaceRenderer(config.webDirectory || '')

      loader.requestAll().then(
        function (collection) {
          const css = renderer.render(collection)
          fs.writeFileSync(path.join(config.targetDirectory, config.cssFile), css)
          resolve({
            css: css,
            fonts: collection
          })
        },
        function (err) {
          logger.error('could not download fonts', err)
          reject(err)
        }
      )
    })
  }
}
