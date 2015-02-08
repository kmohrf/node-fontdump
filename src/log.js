var winston = require("winston");
var log_entry_id = 0;

var logger = new winston.Logger({
    levels: {
        fatal: 4,
        error: 3,
        warn: 2,
        info: 1,
        debug: 0
    }
});

winston.config.addColors({
    fatal: "blue",
    error: "red",
    warn: "yellow",
    info: "green",
    debug: "grey"
});

var log = function(module, level, uuid, message, metadata) {
    logger.log(level, JSON.stringify({
        id: log_entry_id++,
        timestamp: new Date(),
        module: module,
        uuid: uuid,
        level: level,
        message: message,
        metadata: metadata
    }));
};

module.exports = {
    add: function(transport, options) {
        logger.add(transport, options);
    },
    remove: function(transport) {
        logger.remove(transport);
    },
    setLevel: function(level, transport_name) {
        if(transport_name) {
            logger.transports[transport_name].level = level;
        } else {
            for(transport_name in logger.transports) {
                if(!logger.transports.hasOwnProperty(transport_name)) continue;
                logger.transports[transport_name].level = level;
            }
        }
    },
    get_logger: function (options) {
        return {
            fatal: function (uuid, message, metadata) {
                log(options.module, "fatal", uuid, message, metadata);
            },
            error: function (uuid, message, metadata) {
                log(options.module, "error", uuid, message, metadata);
            },
            info: function (uuid, message, metadata) {
                log(options.module, "info", uuid, message, metadata);
            },
            warn: function (uuid, message, metadata) {
                log(options.module, "warn", uuid, message, metadata);
            },
            debug: function (uuid, message, metadata) {
                log(options.module, "debug", uuid, message, metadata);
            }
        };
    }
};

