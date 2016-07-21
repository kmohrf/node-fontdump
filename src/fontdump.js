const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const Promise = require("es6-promise").Promise;
const request = require("request-promise");
const logger = require("winston");
const _ = require("lodash");
const css = require("css");


function hash(data) {
    return crypto.createHash("md5").update(data).digest("hex");
}

function strip_quotes(string, quotation_style="'") {
    if(string.indexOf(quotation_style) === 0 && string.lastIndexOf(quotation_style) === string.length - 1) {
        return string.slice(1, -1);
    }

    return string;
}

const FontSource = function(font, source, extension, format) {
    this.font = font;
    this.source = source;
    this.extension = extension;
    this.format = format;
};

FontSource.prototype = {
    get_filename: function() {
        const range = this.font.unicode_range ? hash(this.font.unicode_range) : "default";
        return `${this.font.family.name}_${this.font.weight}_${this.font.style}_${range}.${this.extension}`
            .replace(/\s+/, "").toLowerCase();
    },
    get_web_filename: function() {
        const filename = this.get_filename();

        if(this.format !== "svg") {
            return filename;
        }

        const hash_pos = this.source.indexOf("#");
        return filename + (hash_pos !== -1 ? this.source.substr(hash_pos) : "");
    }
};

const Font = function(family, weight, style, unicode_range) {
    this.family = family;
    this.weight = weight;
    this.style = style;
    this.unicode_range = unicode_range;
    this.sources = {};
};

Font.prototype = {
    add_source: function(source, extension, format) {
        this.sources[format] = new FontSource(this, source, extension, format);
        return this;
    },
    get_sources: function() {
        return _.values(this.sources);
    },
    has_format: function(format) {
        return _.has(this.sources, format);
    },
    get_source: function(format) {
        return this.sources[format]
    }
};

Font.FORMATS = {
    "woff2": "woff2",
    "woff": "woff",
    "truetype": "ttf",
    "embedded-opentype": "eot",
    "svg": "svg"
};

const FontFamily = function(name) {
    this.name = name;
    this.fonts = {};

    this._create_font_id = function(weight, style, unicode_range) {
        return `${weight}_${style}_${hash(unicode_range || "")}`;
    }
};

FontFamily.prototype = {
    get_fonts: function() {
        return _.values(this.fonts);
    },
    with_font: function(weight, style, unicode_range) {
        const id = this._create_font_id(weight, style, unicode_range);

        if(typeof this.fonts[id] === "undefined") {
            this.fonts[id] = new Font(this, weight, style, unicode_range);
        }

        return this.fonts[id];
    }
};

const FontFamilyCollection = function() {
    this.families = {};
};

FontFamilyCollection.prototype = {
    sync_fonts: function(synchronizer) {
        const syncs = this.get_font_sources().map((function(font_source) {
            return synchronizer(font_source.source, font_source.get_filename());
        }).bind(this));

        return Promise.all(syncs);
    },
    get_families: function() {
        return _.values(this.families);
    },
    get_fonts: function() {
        return Array.prototype.concat.apply([], this.get_families().map(function(family) {
            return family.get_fonts();
        }));
    },
    get_font_sources: function() {
        return Array.prototype.concat.apply([], this.get_fonts().map(function(font) {
            return font.get_sources();
        }));
    },
    with_font_family: function(name) {
        if(typeof this.families[name] === "undefined") {
            this.families[name] = new FontFamily(name);
        }

        return this.families[name];
    }
};

const FontLoader = function(endpoint, target_directory) {
    const self = this;

    this.agents = _.clone(FontLoader.AGENTS);
    this.endpoint = endpoint;
    this.target_directory = target_directory;

    this._create_request = function(endpoint, ua, encoding) {
        const req = request({
            url: endpoint,
            encoding: typeof encoding === "undefined" ? "utf8" : null,
            headers: { "User-Agent": ua || FontLoader.AGENTS.woff }
        });

        req.then(function() {
            // on success
            logger.debug(`successfully downloaded '${endpoint}' with ua '${ua}'`);
        }, function(err) {
            // on error
            logger.error(`error while downloading '${endpoint}' with ua '${ua}'`, err);
        });

        return req;
    };

    this._load_stylesheets = function() {
        const requests = _.values(this.agents).map(function(ua) {
            return self._create_request(self.endpoint, ua);
        });

        return Promise.all(requests);
    };

    this._parse_stylesheet = function(collection, stylesheet) {
        css.parse(stylesheet).stylesheet.rules.forEach(function (rule) {
            if(rule.type !== "font-face") return;

            const declarations = _.keyBy(rule.declarations, "property");
            const weight = declarations["font-weight"]["value"];
            const style = declarations["font-style"]["value"];
            const source_matches = declarations["src"]["value"]
                .match(/(url\((http.+)\) format\('(.+)'\)|url\((http.+.eot)\))/);
            const source = source_matches[2] ? source_matches[2] : source_matches[4];
            const format = source_matches[2] ? source_matches[3] : "embedded-opentype";
            const extension = Font.FORMATS[format];
            const unicode_range = _.has(declarations, "unicode-range") ? declarations["unicode-range"]["value"] : null;
            const family = strip_quotes(declarations["font-family"]["value"]);

            logger.debug(`adding font ${family} with weight ${weight} and style ${style}`);

            collection
                .with_font_family(family)
                .with_font(weight, style, unicode_range)
                .add_source(source, extension, format);
        });
    };

    this._parse_stylesheets = function(stylesheets) {
        logger.info("parsing stylesheets");
        return new Promise((function(resolve) {
            const collection = new FontFamilyCollection();
            stylesheets.forEach(this._parse_stylesheet.bind(this, collection));
            resolve(collection);
        }).bind(this));
    };

    this._write_font = function(target_file, data) {
        return new Promise(function(resolve, reject) {
            fs.writeFile(target_file, data, function(err) {
                if(err) reject(err);
                else resolve(target_file);
            })
        });
    };

    this._sync_font = function(font_source, filename) {
        const target_file = path.join(this.target_directory, filename);

        return this
            ._create_request(font_source, null, null)
            .then(this._write_font.bind(this, target_file));
    };

    this._sync_fonts = function(collection) {
        logger.info("syncing fonts");
        return collection
            .sync_fonts(this._sync_font.bind(this))
            .then(function() {
                return new Promise(function(resolve) {
                    resolve(collection)
                });
            }, function(err) {
                logger.error("could not sync font", err);
            });
    };
};

FontLoader.prototype = {
    request_all: function() {
        return this._load_stylesheets()
            .then(this._parse_stylesheets.bind(this))
            .then(this._sync_fonts.bind(this))
        ;
    },
    disable_format: function(definition_name) {
        if(_.has(this.agents, definition_name)) {
            delete this.agents[definition_name];
        } else {
            throw new Error("no definition with that name or you’ve already disabled it")
        }

        return this;
    }
};

FontLoader.AGENTS = {
    "woff2": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.106 Safari/537.36",
    "woff": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/30.0.1599.101 Safari/537.36",
    "ttf": "Mozilla/5.0 (Linux; U; Android 2.2; en-us; DROID2 GLOBAL Build/S273) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1",
    "svg": "Mozilla/5.0 (iPad; U; CPU OS 3_2 like Mac OS X; en-us) AppleWebKit/531.21.10 (KHTML, like Gecko) Version/4.0.4 Mobile/7B334b Safari/531.21.10",
    "eot": "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; .NET CLR 1.1.4322)"
};

const FontFaceRenderer = function(endpoint) {
    this.endpoint = endpoint;

    this._create_url = function(font_source) {
        const url = this.endpoint
            ? this.endpoint + "/" + font_source.get_web_filename()
            : font_source.get_web_filename();

        return `url('${url}')`;
    };

    this._add_source_set = function(declaration_set, font) {
        if(font.has_format("embedded-opentype")) {
            this._add_declaration(
                declaration_set, "src",
                this._create_url(font.get_source("embedded-opentype"))
            );
        }

        this._add_declaration(declaration_set, "src", font.get_sources().map((function(source) {
            return `${this._create_url(source)} format('${source.format}')`;
        }).bind(this)).join(", "));
    };

    this._add_declaration = function(declaration_set, property, value) {
        declaration_set.push({
            type: "declaration",
            property: property,
            value: value
        });
    };

    this._add_rule = function(ruleset, font) {
        const rule = {
            type: "font-face",
            declarations: []
        };

        this._add_declaration(rule.declarations, "font-family", "'" + font.family.name + "'");
        this._add_declaration(rule.declarations, "font-weight", font.weight);
        this._add_declaration(rule.declarations, "font-style", font.style);
        this._add_source_set(rule.declarations, font);

        if(font.unicode_range) {
            this._add_declaration(rule.declarations, "unicode-range", font.unicode_range);
        }

        logger.debug(
            `adding font-face rule for font-family ${font.family.name} with weight ${font.weight} and 
            style ${font.style}${font.unicode_range ? " and unicode range " + font.unicode_range : ""}`
        );

        ruleset.push(rule);
    };

    this._build_ast = function(collection) {
        logger.info("building ast");

        const ast = {
            type: "stylesheet",
            stylesheet: {
                rules: []
            }
        };

        collection.get_fonts().map(this._add_rule.bind(this, ast.stylesheet.rules));

        return ast;
    }
};

FontFaceRenderer.prototype = {
    render: function(collection) {
        logger.info("rendering font-faces");
        const ast = this._build_ast(collection);
        return css.stringify(ast);
    }
};

module.exports = {
    logger: logger,
    dump: function(config) {
        return new Promise(function(resolve, reject) {
            if(!_.has(config, "url")) {
                throw new Error("url is mandatory");
            }

            if(!_.has(config, "target_directory")) {
                throw new Error("target_directory is mandatory");
            }

            if(!_.has(config, "css_file")) {
                config.css_file = "fonts.css";
            }

            const loader = new FontLoader(config.url, config.target_directory);
            const renderer = new FontFaceRenderer(config.web_directory || "");

            loader.request_all().then(
                function(collection) {
                    const css = renderer.render(collection);
                    fs.writeFileSync(path.join(config.target_directory, config.css_file), css);
                    resolve({
                        css: css,
                        fonts: collection
                    });
                },
                function(err) {
                    logger.error("could not download fonts", err);
                    reject();
                }
            );
        });

    }
};
