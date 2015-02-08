var css = require("css");
var request = require("request");
var rp = require("request-promise");
var Promise = require("es6-promise").Promise;
var _ = require("lodash");
var sprintf = require("sprintf");
var path = require("path");
var fs = require("fs");
var logger = require("./log").get_logger({ module: "fontdump" });


var FontSource = function(font, source, extension, format) {
    this.font = font;
    this.source = source;
    this.extension = extension;
    this.format = format;
};

FontSource.prototype = {
    get_filename: function() {
        return sprintf(
            "%s_%s_%s.%s",
            this.font.family.name, this.font.weight, this.font.style, this.extension
        ).replace(/\s+/, "").toLowerCase();
    },
    get_web_filename: function() {
        var filename = this.get_filename();

        if(this.format !== "svg") {
            return filename;
        }

        var hash_pos = this.source.indexOf("#");
        return filename + (hash_pos !== -1 ? this.source.substr(hash_pos) : "");
    }
};

var Font = function(family, weight, style) {
    this.family = family;
    this.weight = weight;
    this.style = style;
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
        return this.sources.hasOwnProperty(format);
    },
    get_source: function(format) {
        return this.sources[format]
    }
};

Font.FORMATS = {
    "woff": "woff",
    "truetype": "ttf",
    "embedded-opentype": "eot",
    "svg": "svg"
};

var FontFamily = function(name) {
    this.name = name;
    this.fonts = {};

    this._create_font_id = function(weight, style) {
        return sprintf("%s_%s", weight, style);
    }
};

FontFamily.prototype = {
    get_fonts: function() {
        return _.values(this.fonts);
    },
    with_font: function(weight, style) {
        var id = this._create_font_id(weight, style);

        if(typeof this.fonts[id] === "undefined") {
            this.fonts[id] = new Font(this, weight, style);
        }

        return this.fonts[id];
    }
};

var FontFamilyCollection = function() {
    this.families = {};
};

FontFamilyCollection.prototype = {
    sync_fonts: function(synchronizer) {
        var syncs = this.get_font_sources().map((function(font_source) {
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

var FontLoader = function(endpoint, target_directory) {
    var self = this;

    this.agents = _.clone(FontLoader.AGENTS);
    this.endpoint = endpoint;
    this.target_directory = target_directory;

    this._create_request = function(endpoint, ua) {
        request = rp({
            url: endpoint,
            headers: { "User-Agent": ua }
        }).promise();

        request.then(function() {
            // on success
            logger.debug(sprintf("successfully downloaded '%s' with ua '%s'", endpoint, ua));
        }, function() {
            // on error
            logger.error(sprintf("error while downloading '%s' with ua '%s'", endpoint, ua));
        });

        return request;
    };

    this._load_stylesheets = function() {
        var requests = _.values(this.agents).map(function(ua) {
            return self._create_request(self.endpoint, ua);
        });

        return Promise.all(requests);
    };

    this._parse_stylesheet = function(collection, stylesheet) {
        css.parse(stylesheet).stylesheet.rules.forEach(function (rule) {
            var declarations = _.indexBy(rule.declarations, "property");
            var weight = declarations["font-weight"]["value"];
            var style = declarations["font-style"]["value"];
            var source_matches = declarations["src"]["value"]
                .match(/(url\((http.+)\) format\('(.+)'\)|url\((http.+.eot)\))/);
            var source = source_matches[2] ? source_matches[2] : source_matches[4];
            var format = source_matches[2] ? source_matches[3] : "embedded-opentype";
            var extension = Font.FORMATS[format];
            var family = declarations["font-family"]["value"];
            family = family.indexOf("'") === 0 ? family.slice(1, -1) : family;

            logger.debug(sprintf("adding font %s with weight %s and style %s", family, weight, style));

            collection
                .with_font_family(family)
                .with_font(weight, style)
                .add_source(source, extension, format);
        });
    };

    this._parse_stylesheets = function(stylesheets) {
        logger.info("parsing stylesheets");
        return new Promise((function(resolve, reject) {
            var collection = new FontFamilyCollection();
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
        var target_file = path.join(this.target_directory, filename);

        return this
            ._create_request(font_source)
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
            }, function() {
                logger.error("could not sync font");
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
        if(this.agents.hasOwnProperty(definition_name)) {
            delete this.agents[definition_name];
        } else {
            throw new Error("no definition with that name or you’ve already disabled it")
        }

        return this;
    }
};

FontLoader.AGENTS = {
    // Chrome
    "woff":  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/30.0.1599.101 Safari/537.36",
    // IE 9
    "eot":   "Mozilla/5.0 (MSIE 9.0; Windows NT 6.1; Trident/5.0)",
    // Android 2
    "ttf":   "Mozilla/5.0 (Linux; U; Android 2.2; en-us; DROID2 GLOBAL Build/S273) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1",
    // iOS<4.2
    "svg":   "Mozilla/5.0 (iPad; U; CPU OS 3_2 like Mac OS X; en-us) AppleWebKit/531.21.10 (KHTML, like Gecko) Version/4.0.4 Mobile/7B334b Safari/531.21.10",
    // IE 6-8
    "ie6-8": "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; .NET CLR 1.1.4322)"
};

FontFaceRenderer = function(endpoint) {
    this.endpoint = endpoint;

    this._create_url = function(font_source) {
        return sprintf("url('%s')",
            this.endpoint
                ? this.endpoint + "/" + font_source.get_web_filename()
                : font_source.get_web_filename()
        );
    };

    this._add_source_set = function(declaration_set, font) {
        if(font.has_format("embedded-opentype")) {
            this._add_declaration(
                declaration_set, "src",
                this._create_url(font.get_source("embedded-opentype"))
            );
        }

        this._add_declaration(declaration_set, "src", font.get_sources().map((function(source) {
            return sprintf("%s format('%s')", this._create_url(source), source.format);
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
        var rule = {
            type: "font-face",
            declarations: []
        };

        this._add_declaration(rule.declarations, "font-family", "'" + font.family.name + "'");
        this._add_declaration(rule.declarations, "font-weight", font.weight);
        this._add_declaration(rule.declarations, "font-style", font.style);
        this._add_source_set(rule.declarations, font);

        logger.debug(sprintf(
            "adding font-face rule for font-family %s with weight %s and style %s",
            font.family.name, font.weight, font.style
        ));

        ruleset.push(rule);
    };

    this._build_ast = function(collection) {
        logger.info("building ast");

        var ast = {
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
    render: function(target_directory, collection) {
        logger.info("rendering font-faces");

        var ast = this._build_ast(collection);
        fs.writeFile(
            path.join(target_directory, "fonts.css"),
            css.stringify(ast)
        );
    }
};

module.exports = {
    dump: function(config) {
        if(!config.hasOwnProperty("url")) {
            throw new Error("url is mandatory");
        }

        if(!config.hasOwnProperty("target_directory")) {
            throw new Error("target_directory is mandatory");
        }

        var loader = new FontLoader(config.url, config.target_directory);
        var renderer = new FontFaceRenderer(config.web_directory || "");

        loader.request_all().then(
            renderer.render.bind(renderer, config.target_directory),
            function() {
                logger.error("could not download fonts");
            }
        );
    }
};