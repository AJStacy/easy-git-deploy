var argv = require("yargs").argv;

if (argv.d) {
  console.log("Starting in daemon mode...");
  require('daemon')();
  console.log("The process PID is "+process.pid+".");
}

var GitLabAutoDeploy = require("./src/GitLabAutoDeploy");
var config = require('./config.json');
var server = new GitLabAutoDeploy.Server(config);
server.start();