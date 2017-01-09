"use strict";
var http = require("http");
var shell = require("shelljs");
var _ = require("lodash");
var moment = require("moment");
var fs = require("fs");
var Server = (function () {
    function Server(config, logger) {
        console.log(moment().format("(MM-DD-YYYY > hh:mm a)"));
        // Store the logger object in a property
        this.logger = logger;
        // Initialize the POST property as an Array
        this.POST = [];
        // Get the configuration
        this.SERVER_CONFIG = config;
        // Set the logging timestamp format
        this.TIME_FORMAT = this.SERVER_CONFIG.server.timestamp_format;
        this.TIME_OBJECT = { timestamp: moment().format(this.TIME_FORMAT) };
        this.logger.verbose("The configuration received by the server instance: %j", this.SERVER_CONFIG);
        this.logger.debug("Constructor instantiation complete.");
    }
    /**
     * `start()` handles receiving http requests and POST data.
     */
    Server.prototype.start = function () {
        var self = this;
        // Attempt to create the ./repos directory
        fs.mkdir('./repos', function (err) {
            if (err && err.code !== 'EEXIST')
                self.logger.error("Failed to create the ./repos directory.", self.TIME_OBJECT);
            if (err.code === 'EEXIST')
                self.logger.warn("The ./repos directory already exists. Continuing...", self.TIME_OBJECT);
        });
        // `server` stores the new http server instance.
        var server = http.createServer(function (req, res) {
            self.handleRequest(req, res, self.logger, function (postData) {
                self.postDataReceived(postData);
            });
        });
        // Starting up our http server at the port specified in the `SERVER_CONFIG`.
        server.listen(self.SERVER_CONFIG.server.port, function () {
            //Callback triggered when server is successfully listening. Hurray!
            self.logger.debug("Server listening on: http://localhost:%s", self.SERVER_CONFIG.server.port, self.TIME_OBJECT);
        });
    };
    /**
     * `handleRequest()` handles receiving http requests and POST data.
     */
    Server.prototype.handleRequest = function (req, res, logger, callback) {
        // Ignore favicon requests
        if (req.url === '/favicon.ico') {
            logger.debug("Received a favicon request. Ignoring...", this.TIME_OBJECT);
            res.writeHead(200, { 'Content-Type': 'image/x-icon' });
            res.end();
            return;
        }
        var postData = [];
        // Gather the post data.
        if (req.method == 'POST') {
            logger.debug("Received a Post request.", this.TIME_OBJECT);
            // Gather the post data
            req.on('data', function (chunk) {
                postData.push(chunk);
            });
            // Trigger the main logic after POST data has been received.
            req.on('end', function () {
                logger.debug("The Post data received : %j", postData, this.TIME_OBJECT);
                callback(postData);
            });
            req.on('error', function (err) {
                logger.error("Failed to receive the Post data. ERR_MSG: ", err, { error: err, timestamp: moment().format(this.TIME_FORMAT) });
            });
        }
    };
    /**
     * `postDataReceived()` sets the class properties after the server finished receiving the post data. It then activates `main()`.
     */
    Server.prototype.postDataReceived = function (data) {
        // Set the server class properties
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
        // Test if the current post request meets the deploy conditions specified in the config and if true run the boot process
        if (this.isTriggered())
            this.boot();
        else
            this.logger.warn("The Post data parameters did not meet the deploy hook requirements defined by the configuration.", this.TIME_OBJECT);
    };
    /**
     * `getDeployConfig()` matches a repository name from the server config with the current post data object repository name and returns the matched object.
     */
    Server.prototype.retrieveDeployConfig = function () {
        // Loop through each repository in the configuration
        for (var x = 0; x < this.SERVER_CONFIG.repositories.length; x++) {
            // Check if the name matches the repo name triggered by the post data
            if (this.SERVER_CONFIG.repositories[x].name === this.POST.repository.name) {
                this.logger.debug("Matched a repository successfully.", { repository: this.SERVER_CONFIG.repositories[x], timestamp: moment().format(this.TIME_FORMAT) });
                return this.SERVER_CONFIG.repositories[x];
            }
        }
        this.logger.debug("No matching repository was found in the configuration.", this.TIME_OBJECT);
        return false;
    };
    /**
     * `getTargetConfig()` branch ref from the server config with the current post data object repository name and returns the matched object.
     */
    Server.prototype.retrieveTargetConfig = function () {
        // Loop through that repos target branches and try to match to the target branch sent by the post data
        for (var i = 0; i < this.DEPLOY_CONFIG.targets.length; i++) {
            // If the repo has a matching branch, return the value of the target_key
            if (this.DEPLOY_CONFIG.targets[i].ref === this.POST.ref) {
                this.logger.debug("Matched a repository target branch successfully.", { target_branch: this.DEPLOY_CONFIG.targets[i], timestamp: moment().format(this.TIME_FORMAT) });
                return this.DEPLOY_CONFIG.targets[i];
            }
        }
        this.logger.debug("No matching repository target branch was found in the configuration.", this.TIME_OBJECT);
        return false;
    };
    /**
     * `isTriggered()` checks if the POST properties hook conditions meet those configured for triggering a deployment.
     */
    Server.prototype.isTriggered = function () {
        var hooks = Object.keys(this.TARGET_CONFIG.hooks);
        var truth = [];
        for (var index in hooks) {
            var hook = hooks[index];
            this.logger.debug("Attempting to match the hook with a key of %s.", hook, this.TIME_OBJECT);
            if (this.POST[hook]) {
                this.logger.debug("Matched the hook key in the Post data!", this.TIME_OBJECT);
                if (this.POST[hook] === this.TARGET_CONFIG.hooks[hook]) {
                    this.logger.debug("Matched the hook value in the target branch config with the post value.", { target_config: this.TARGET_CONFIG.hooks[hook], post_value: this.POST[hook], timestamp: moment().format(this.TIME_FORMAT) });
                    truth.push(true);
                }
            }
        }
        // Check if all of the configured hooks match the GitLab post data
        var matched = (hooks.length === truth.length);
        if (matched)
            this.logger.debug("All hooks in the repository target branch config matched!", this.TIME_OBJECT);
        return matched;
    };
    /**
     * `boot()` reads the server mode from the config and activates the proper logic for that mode.
     */
    Server.prototype.boot = function () {
        this.logger.debug("Attempting to run the %s server mode.", this.SERVER_CONFIG.server.mode, this.TIME_OBJECT);
        // use the server mode as an function call
        var name = "mode" + _.capitalize(this.SERVER_CONFIG.server.mode);
        var fn = this[name];
        if (typeof fn === 'function') {
            this[name]();
        }
        else {
            this.logger.error("Server mode configuration is invalid.", this.TIME_OBJECT);
        }
    };
    /**
     * `modeStandalone()` will attempt to clone the repo, pull the latest branch, set the remote URL, and push the branch to it.
     */
    Server.prototype.modeStandalone = function () {
        var _this = this;
        // Try to clone the git repo
        this.gitClone(function (status) {
            // Check its status for a success or failure and run callbacks
            _this.statusCheck(status, function () {
                // Make sure the remote for deploying is set.
                _this.gitSetRemote(function () {
                    // Push to the deploy remote.
                    _this.gitPushToDeploy();
                });
            }, function () {
                // Pull the current branch
                _this.gitPullMaster(function (status) {
                    // Push to the deploy remote
                    _this.gitPushToDeploy();
                });
            });
        });
    };
    /**
     * `modeLocal()` will set a remote on the repo existing on GitLab and then push it to that newly created remote.
     */
    Server.prototype.modeLocal = function () {
        var _this = this;
        // Set the production remote
        // Push the branch to the production remote
        this.gitSetRemote(function (status) {
            _this.gitPushToDeploy();
        });
    };
    /**
     *  `statusCheck()` checks if the status from a shell exec is success or fail and triggers the appropriate callback.
     */
    Server.prototype.statusCheck = function (status, success, fail) {
        if (status === 0)
            success();
        else
            fail();
    };
    /**
     *  `gitPushToDeploy()` runs a `git push` command from the target repo to the set `deploy` remote.
     */
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
    /**
     *  `gitPullMaster()` runs a `git pull` command from the target repo to the `./repos` directory.
     */
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
    /**
     *  `gitSetRemote()` set the git remote URL for deploying the project.
     */
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
    /**
     *  `gitClone()` clones the target repo received in the post data to the `./repos` directory.
     */
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
