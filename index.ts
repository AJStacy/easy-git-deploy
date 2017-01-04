import * as GitLabAutoDeploy from "./GitLabAutoDeploy";
var config = require('./config.json');

var server = new GitLabAutoDeploy.Server(config);