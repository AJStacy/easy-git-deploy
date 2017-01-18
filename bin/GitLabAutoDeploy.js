"use strict";
var http = require("http");
var shell = require("shelljs");
var _ = require("lodash");
var moment = require("moment");
var fs = require("fs");
var Server = (function () {
    function Server(config, logger) {
        console.log(moment().format("(MM-DD-YYYY > hh:mm a)"));
        this.logger = logger;
        this.POST = [];
        this.SERVER_CONFIG = config;
        this.TIME_FORMAT = this.SERVER_CONFIG.server.timestamp_format;
        this.TIME_OBJECT = { timestamp: moment().format(this.TIME_FORMAT) };
        this.logger.verbose("The configuration received by the server instance: %j", this.SERVER_CONFIG);
        this.logger.debug("Constructor instantiation complete.");
    }
    Server.prototype.start = function () {
        var self = this;
        fs.mkdir('./repos', function (err) {
            if (err && err.code !== 'EEXIST')
                self.logger.error("Failed to create the ./repos directory.", self.TIME_OBJECT);
            if (err.code === 'EEXIST')
                self.logger.warn("The ./repos directory already exists. Continuing...", self.TIME_OBJECT);
        });
        var server = http.createServer(function (req, res) {
            self.handleRequest(req, res, self.logger, function (postData) {
                self.postDataReceived(postData);
            });
        });
        server.listen(self.SERVER_CONFIG.server.port, function () {
            self.logger.debug("Server listening on: http://localhost:%s", self.SERVER_CONFIG.server.port, self.TIME_OBJECT);
        });
    };
    Server.prototype.handleRequest = function (req, res, logger, callback) {
        if (req.url === '/favicon.ico') {
            logger.debug("Received a favicon request. Ignoring...", this.TIME_OBJECT);
            res.writeHead(200, { 'Content-Type': 'image/x-icon' });
            res.end();
            return;
        }
        var postData = [];
        if (req.method == 'POST') {
            logger.debug("Received a Post request.", this.TIME_OBJECT);
            req.on('data', function (chunk) {
                postData.push(chunk);
            });
            req.on('end', function () {
                logger.debug("The Post data received : %j", postData, this.TIME_OBJECT);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                callback(postData);
            });
            req.on('error', function (err) {
                logger.error("Failed to receive the Post data. ERR_MSG: ", err, { error: err, timestamp: moment().format(this.TIME_FORMAT) });
            });
        }
    };
    Server.prototype.postDataReceived = function (data) {
        this.logger.debug("Setting the server class properties (POST, ORIGIN, and DEPLOY_CONFIG')", this.TIME_OBJECT);
        this.POST = JSON.parse(Buffer.concat(data).toString());
        this.ORIGIN = this.POST.repository.url;
        try {
            this.DEPLOY_CONFIG = this.retrieveDeployConfig();
            this.TARGET_CONFIG = this.retrieveTargetConfig();
        }
        catch (err) {
            this.logger.error("Failed to retrieve data from the configuration object.", { timestamp: moment().format(this.TIME_FORMAT), error: err });
        }
        if (this.isTriggered())
            this.deploy();
        else
            this.logger.warn("The Post data parameters did not meet the deploy hook requirements defined by the configuration.", this.TIME_OBJECT);
    };
    Server.prototype.retrieveDeployConfig = function () {
        for (var x = 0; x < this.SERVER_CONFIG.repositories.length; x++) {
            if (this.SERVER_CONFIG.repositories[x].name === this.POST.repository.name) {
                this.logger.debug("Matched a repository successfully.", { repository: this.SERVER_CONFIG.repositories[x], timestamp: moment().format(this.TIME_FORMAT) });
                return this.SERVER_CONFIG.repositories[x];
            }
        }
        this.logger.debug("No matching repository was found in the configuration.", this.TIME_OBJECT);
        return false;
    };
    Server.prototype.retrieveTargetConfig = function () {
        for (var i = 0; i < this.DEPLOY_CONFIG.targets.length; i++) {
            if (this.DEPLOY_CONFIG.targets[i].ref === this.POST.ref) {
                this.logger.debug("Matched a repository target branch successfully.", { target_branch: this.DEPLOY_CONFIG.targets[i], timestamp: moment().format(this.TIME_FORMAT) });
                return this.DEPLOY_CONFIG.targets[i];
            }
        }
        this.logger.debug("No matching repository target branch was found in the configuration.", this.TIME_OBJECT);
        return false;
    };
    Server.prototype.isTriggered = function () {
        var hook_paths = Object.keys(this.TARGET_CONFIG.hooks);
        var truth = [];
        for (var index in hook_paths) {
            var hook_path = hook_paths[index];
            var hook_value = this.TARGET_CONFIG.hooks[hook_path];
            this.logger.debug("Attempting to match the hook with a key of %s and a value of %s.", hook_path, hook_value, this.TIME_OBJECT);
            if (this.getDeepMatch(this.POST, hook_path, hook_value)) {
                this.logger.debug("Matched the hook value in the target branch config with the post value.", { target_config: hook_value, post_value: this.POST[hook_path], timestamp: moment().format(this.TIME_FORMAT) });
                truth.push(true);
            }
        }
        var matched = (hook_paths.length === truth.length);
        if (matched)
            this.logger.debug("All hooks in the repository target branch config matched!", this.TIME_OBJECT);
        return matched;
    };
    Server.prototype.getDeepMatch = function (object, path, value) {
        if (_.hasIn(object, path)) {
            return (_.get(object, path) === value);
        }
        return false;
    };
    Server.prototype.deploy = function () {
        var _this = this;
        this.logger.info("Attempting to deploy branch '%s' for commit with message of '%s' by '%s'...", this.POST.ref, this.POST.commit.message, this.POST.commit.author_name, this.TIME_OBJECT);
        this.gitClone(function (status) {
            _this.statusCheck(status, function () {
                _this.gitSetRemote(function () {
                    _this.gitPushToDeploy();
                });
            }, function () {
                _this.gitPullMaster(function (status) {
                    _this.gitPushToDeploy();
                });
            });
        });
    };
    Server.prototype.statusCheck = function (status, success, fail) {
        if (status === 0)
            success();
        else
            fail();
    };
    Server.prototype.gitPushToDeploy = function (callback) {
        shell.exec('cd repos/' + this.DEPLOY_CONFIG.name + ' && git push deploy master --force', function (status, output, err) {
            if (status === 0)
                this.logger.debug('Deployed successfully.', this.TIME_OBJECT);
            else
                this.logger.error('Failed to push to the deploy server!', { error: err, timestamp: moment().format(this.TIME_FORMAT) });
            if (callback)
                callback(status);
        });
    };
    Server.prototype.gitPullMaster = function (callback) {
        var return_status;
        shell.exec('cd repos/' + this.DEPLOY_CONFIG.name + ' && git pull origin master', function (status, output, err) {
            if (status === 0)
                this.logger.debug('Remote branch pulled successfully.', this.TIME_OBJECT);
            else
                this.logger.debug('Remote pull is already up to date.', this.TIME_OBJECT);
            if (callback)
                callback(status);
        });
    };
    Server.prototype.gitSetRemote = function (callback) {
        shell.exec('cd repos/' + this.DEPLOY_CONFIG.name + ' && git remote add ' + this.SERVER_CONFIG.deploy_remote_name + ' ' + this.TARGET_CONFIG.deploy_url, function (status, output, err) {
            if (status === 0)
                this.logger.debug('Remote named "%s" set.', this.SERVER_CONFIG.deploy_remote_name, this.TIME_OBJECT);
            else
                this.logger.debug('Remote already exists.', this.TIME_OBJECT);
            if (callback)
                callback(status);
        });
    };
    Server.prototype.gitClone = function (callback) {
        shell.exec('cd repos && git clone ' + this.ORIGIN + ' ' + this.DEPLOY_CONFIG.name, function (status, output, err) {
            if (status === 0)
                this.logger.debug('Repository cloned successfully.', this.TIME_OBJECT);
            else
                this.logger.debug('Repository already cloned.', this.TIME_OBJECT);
            if (callback)
                callback(status);
        });
    };
    return Server;
}());
exports.Server = Server;
