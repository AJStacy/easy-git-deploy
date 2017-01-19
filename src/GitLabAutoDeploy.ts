import * as http from "http";
import * as util from "util";
import * as shell from "shelljs";
import * as jsonBody from "body/json";
import * as _ from "lodash";
import * as moment from "moment";
import * as fs from "fs";

interface Callback { ():void; }
interface StatusCallback { (status:number):void; }

export class Server {

  /** 
   * `POST` stores the JSON parsed post data received from GitLab as a global variable for easy access.
   */
  private POST:any;

  /** 
   * `logger` contains the logger object.
   */
  private logger:any;

  /** 
   * `SERVER_CONFIG` stores the configuration from **server.conf.json** as a global variable for easy access.
   */
  private SERVER_CONFIG:any;

  /**
   * Stores the origin as a global variable for easy access.
   */
  private ORIGIN:string;

  /** 
   *  `DEPLOY_CONFIG` stores the deploy configuration based on the repo name from the post data.
   */
  private DEPLOY_CONFIG:any;

  /** 
   *  `TARGET_CONFIG` stores the target configuration based on the `DEPLOY_CONFIG` branch ref.
   */
  private TARGET_CONFIG:any;

  /** 
   *  `TIME_FORMAT` stores the format for how timestamps are logged.
   */
  private TIME_FORMAT:string;

  /** 
   *  `TIME_OBJECT` stores the entire basic timestamp object meta.
   */
  private TIME_OBJECT:Object;

  constructor(config:any, logger:any) {

    console.log(moment().format("(MM-DD-YYYY > hh:mm a)"));
    // Store the logger object in a property
    this.logger = logger;
    // Initialize the POST property as an Array
    this.POST = [];
    // Get the configuration
    this.SERVER_CONFIG = config;
    // Set the logging timestamp format
    this.TIME_FORMAT = this.SERVER_CONFIG.server.timestamp_format;
    this.TIME_OBJECT = {timestamp: moment().format(this.TIME_FORMAT)};

    this.logger.verbose("The configuration received by the server instance: %j", this.SERVER_CONFIG);
    this.logger.debug("Constructor instantiation complete.");
  }

  /** 
   * `start()` handles receiving http requests and POST data.
   */
  public start():void {

    var self = this;

    // Attempt to create the ./repos directory
    fs.mkdir('./repos', function(err) {
      if (err && err.code !== 'EEXIST') self.logger.error("Failed to create the ./repos directory.", self.TIME_OBJECT);
      if (err.code === 'EEXIST') self.logger.warn("The ./repos directory already exists. Continuing...", self.TIME_OBJECT);
    });

    // `server` stores the new http server instance.
    var server:http.Server = http.createServer(function(req, res) {
      self.handleRequest(req, res, self.logger, function(postData) {
        self.postDataReceived(postData);
      });
    });

    // Starting up our http server at the port specified in the `SERVER_CONFIG`.
    server.listen(self.SERVER_CONFIG.server.port, function() {
      //Callback triggered when server is successfully listening. Hurray!
      self.logger.debug("Server listening on: http://localhost:%s", self.SERVER_CONFIG.server.port, self.TIME_OBJECT);
    });

  }

  /** 
   * `handleRequest()` handles receiving http requests and POST data.
   */
  private handleRequest(req:http.ServerRequest, res:http.ServerResponse, logger:any, callback:any):void {

    // Ignore favicon requests
    if (req.url === '/favicon.ico') {
      logger.debug("Received a favicon request. Ignoring...", this.TIME_OBJECT);
      res.writeHead(200, {'Content-Type': 'image/x-icon'} );
      res.end();
      return;
    }

    var postData = [];

    // Gather the post data.
    if (req.method == 'POST') {
      logger.debug("Received a Post request.", this.TIME_OBJECT);
      // Gather the post data
      req.on('data', function(chunk) {
        postData.push(chunk);
      });
      // Trigger the main logic after POST data has been received.
      req.on('end', function() {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        callback(postData);
      });
      req.on('error', function(err) {
        logger.error("Failed to receive the Post data. ERR_MSG: ", err, {error: err, timestamp: moment().format(this.TIME_FORMAT)});
      });
    }

  }

  /** 
   * `postDataReceived()` sets the class properties after the server finished receiving the post data. It then activates `main()`.
   */
  private postDataReceived(data:any):void {

    // Set the server class properties
    this.logger.debug("Setting the server class properties (POST, ORIGIN, and DEPLOY_CONFIG')", this.TIME_OBJECT);
    this.POST = JSON.parse(Buffer.concat(data).toString());
    this.logger.debug("The Post data received:", {postData: this.POST, timestamp: moment().format(this.TIME_FORMAT)});
    this.ORIGIN = this.POST.repository.url;

    this.DEPLOY_CONFIG = this.retrieveDeployConfig();
    // this.TARGET_CONFIG = this.retrieveTargetConfig();

    // If both the Deploy Config and Target Config were retrieved properly
    if (this.DEPLOY_CONFIG) { //&& this.TARGET_CONFIG
      // Test if the current post request meets the deploy conditions specified in the config and if true run the boot process
      if (this.isTriggered()) this.deploy();
      else this.logger.warn("The Post data parameters did not meet the deploy hook requirements defined by the configuration.", this.TIME_OBJECT);
    }

  }

  /** 
   * `getDeployConfig()` matches a repository name from the server config with the current post data object repository name and returns the matched object.
   * @return mixed  Object or false
   */
  private retrieveDeployConfig():any {
    // Loop through each repository in the configuration
    for (var x = 0; x < this.SERVER_CONFIG.repositories.length; x++) {
      // Check if the name matches the repo name triggered by the post data
      if (this.SERVER_CONFIG.repositories[x].name === this.POST.repository.name) {
        this.logger.debug("Matched a repository successfully.", {repository: this.SERVER_CONFIG.repositories[x], timestamp: moment().format(this.TIME_FORMAT)});
        return this.SERVER_CONFIG.repositories[x];
      }
    }
    this.logger.debug("No matching repository was found in the configuration.", this.TIME_OBJECT);
    return false;
  }

  /** 
   * `isTriggered()` checks if the POST properties hook conditions meet those configured for triggering a deployment.
   * @return boolean
   */
  private isTriggered():boolean {

    // Loop through each Target Config for matched hooks
    for (var i = 0; i < this.DEPLOY_CONFIG.targets.length; i++) {

      var target_config = this.DEPLOY_CONFIG.targets[i];

      // Get the hook paths
      var hook_paths = Object.keys(target_config.hooks);
      // Instantiate an array to store the truthiness of each hook
      var truth = [];

      for (var index in hook_paths) {
        // The actual hook path
        var hook_path = hook_paths[index];
        // The hook's value
        var hook_value = target_config.hooks[hook_path];

        this.logger.debug("Attempting to match the hook with a key of %s and a value of %s.", hook_path, hook_value, this.TIME_OBJECT);
        
        // If the hook path matches a path in the POST data, and if the value of both the POST Data path and hook path match
        if ( this.getDeepMatch(this.POST, hook_path, hook_value) ) {
          this.logger.debug("Matched the hook value in the target branch config with the post value.", {target_config: hook_value, post_value: this.POST[hook_path], timestamp: moment().format(this.TIME_FORMAT)});
          truth.push(true);
        }
        
      }
      // Check if all of the configured hooks match the GitLab post data
      var matched = ( hook_paths.length === truth.length );
      if (matched) {
        this.logger.debug("All hooks in the repository target branch config matched!", this.TIME_OBJECT);
        // Set the server's TARGET_CONFIG property since the hooks match
        this.TARGET_CONFIG = target_config;
        return true;
      }
    
    }

    return false;
  }

    /** 
   * `getDeepMatch()` validates a path in a passed in object and then tests whether the value at that path matches the passed in value
   * @return boolean 
   */
  private getDeepMatch(object:any, path:string, value:any):boolean {
    if (_.hasIn(object, path)) {
      this.logger.debug("The path exists in the object.", {path: path, timestamp: moment().format(this.TIME_FORMAT)});
      this.logger.debug("Do the values match?", {hook_value: value, post_value: _.get(object, path), timestamp: moment().format(this.TIME_FORMAT)});
      return (_.get(object, path) === value);
    }
    return false;
  }

  /** 
   * `deploy()` will attempt to clone the repo, pull the latest branch, set the remote URL, and push the branch to it.
   */
  private deploy():void {

    this.logger.info("Attempting to deploy branch '%s'...", this.TARGET_CONFIG.branch, this.TIME_OBJECT);

    // Try to clone the git repo
    this.gitClone( () => {
      // Make sure the remote for deploying is set
      this.gitSetRemote( () => {
        // Fetch the targeted branch
        this.gitFetchBranch( () => {
          // Checkout the targeted branch
          this.gitCheckoutBranch( () => {
            // Pull the targeted branch from GitLab for updates
            this.gitPullBranch( () => {
              // Push the targeted branch to the deploy remote
              this.gitPushToDeploy();
            });
          });
        });
      });
    });
  }

  /** 
   *  `gitPushToDeploy()` runs a `git push` command from the target repo to the set `deploy` remote.
   */
  private gitPushToDeploy(callback?:StatusCallback):void {
    var self = this;
    shell.exec('cd repos/'+this.DEPLOY_CONFIG.name+' && git push '+this.SERVER_CONFIG.server.deploy_remote_name+' '+this.TARGET_CONFIG.branch+' --force', function (status, output, err) {
      if (status === 0) self.logger.debug('Deployed successfully.', self.TIME_OBJECT);
      else self.logger.warn('Failed to push to the deploy server.', {error: err, timestamp: moment().format(self.TIME_FORMAT)});
      if (callback) callback(status);
    });
  }

  /** 
   *  `gitCheckoutBranch()` runs a `git checkout` command to checkout the currently targeted branch on the temp repo.
   */
  private gitCheckoutBranch(callback?:StatusCallback):void {
    var self = this;
    shell.exec('cd repos/'+this.DEPLOY_CONFIG.name+' && git checkout '+this.TARGET_CONFIG.branch, function (status, output, err) {
      if (status === 0) self.logger.debug('Checkout of branch was successful.', self.TIME_OBJECT);
      else self.logger.warn('Checkout of branch failed.', {error: err, timestamp: moment().format(self.TIME_FORMAT)});
      if (callback) callback(status);
    });
  }

  /** 
   *  `gitFetchBranch()` runs a `git fetch` command to retrieve the currently targeted branch from GitLab.
   */
  private gitFetchBranch(callback?:StatusCallback):void {
    var self = this;
    shell.exec('cd repos/'+this.DEPLOY_CONFIG.name+' && git fetch origin '+this.TARGET_CONFIG.branch+':'+this.TARGET_CONFIG.branch, function (status, output, err) {
      if (status === 0) self.logger.debug('Remote branch fetched successfully.', self.TIME_OBJECT);
      else self.logger.warn('Remote fetch failed.', {error: err, timestamp: moment().format(self.TIME_FORMAT)});
      if (callback) callback(status);
    });
  }

  /** 
   *  `gitPullBranch()` runs a `git pull` command to make sure the currently targeted branch is up to date.
   */
  private gitPullBranch(callback?:StatusCallback):void {
    var self = this;
    shell.exec('cd repos/'+this.DEPLOY_CONFIG.name+' && git pull origin '+this.TARGET_CONFIG.branch, function (status, output, err) {
      if (status === 0) self.logger.debug('Remote branch pulled successfully.', self.TIME_OBJECT);
      else self.logger.warn('Remote pull failed.', {error: err, timestamp: moment().format(self.TIME_FORMAT)});
      if (callback) callback(status);
    });
  }

  /** 
   *  `gitSetRemote()` set the git remote URL for deploying the project.
   */
  private gitSetRemote(callback?:StatusCallback):void {
    var self = this;
    shell.exec('cd repos/'+this.DEPLOY_CONFIG.name+' && git remote add '+this.SERVER_CONFIG.server.deploy_remote_name+' '+this.TARGET_CONFIG.deploy_url, function (status, output, err) {
      if (status === 0) self.logger.debug('Remote named "%s" set.', self.SERVER_CONFIG.deploy_remote_name, self.TIME_OBJECT);
      else self.logger.debug('Failed to set the remote', {error: err, timestamp: moment().format(self.TIME_FORMAT)});
      if (callback) callback(status);
    });
  }

  /** 
   *  `gitClone()` clones the target repo received in the post data to the `./repos` directory.
   */
  private gitClone(callback?:StatusCallback):void {
    var self = this;
    shell.exec('cd repos && git clone '+this.ORIGIN+' '+this.DEPLOY_CONFIG.name, function(status, output, err) {
      if (status === 0) self.logger.debug('Repository cloned successfully.', self.TIME_OBJECT);
      else self.logger.debug('Error cloning the repository.', {error: err, timestamp: moment().format(self.TIME_FORMAT)});
      if (callback) callback(status);
    });
  }

}

