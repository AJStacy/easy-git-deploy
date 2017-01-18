// Enable command line parameters
var argv = require("yargs").argv;

// Instantiate the logging
var winston = require("winston");
require('winston-daily-rotate-file');

// Get the server configuration
var config = require('./config.json');

var daily = new winston.transports.DailyRotateFile({
  filename: './logs/log',
  datePattern: 'yyyy-MM-dd.',
  prepend: true,
  level: config.server.log_level
});

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)(),
    daily
  ]
});


if (argv.d) {
  logger.debug("Starting in daemon mode...");
  require('daemon')();
  logger.verbose("The process PID is "+process.pid+".");
}


var GitLabAutoDeploy = require("./bin/GitLabAutoDeploy");

logger.debug("Instantiating the GitLab Auto Deploy server...");
// Requires a JSON config object and a Winston logger instance as parameters
var server = new GitLabAutoDeploy.Server(config, logger);
logger.debug("Starting the server...");
server.start();