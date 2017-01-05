import * as http from "http";
import * as util from "util";
import * as shell from "shelljs";
import * as jsonBody from "body/json";
import * as _ from "lodash";
import * as fs from "fs";

interface Callback { ():void; }
interface StatusCallback { (status:number):void; }

export class Server {

  /** 
   * `POST` stores the JSON parsed post data received from GitLab as a global variable for easy access.
   */
  private POST:any;

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

  constructor(config:any) {
    // Initialize the POST property as an Array
    this.POST = [];
    // Get the configuration
    this.SERVER_CONFIG = config;
  }

  /** 
   * `start()` handles receiving http requests and POST data.
   */
  public start() {

    var self = this;

    // Attempt to create the ./repos directory
    fs.mkdir('./repos', function(err) {
      if (err && err.code !== 'EEXIST') console.log("Failed to create the ./repos directory.");
    });

    // `server` stores the new http server instance.
    var server:http.Server = http.createServer(function(req, res) {
      console.log("here");
      self.handleRequest(req, res, function(postData) {
        console.log("handling the request bruh");
        self.postDataReceived(postData);
      });
    });

    // Starting up our http server at the port specified in the `SERVER_CONFIG`.
    server.listen(self.SERVER_CONFIG.server.port, function() {
      //Callback triggered when server is successfully listening. Hurray!
      console.log("Server listening on: http://localhost:%s", self.SERVER_CONFIG.server.port);
    });

  }

  /** 
   * `handleRequest()` handles receiving http requests and POST data.
   */
  private handleRequest(req:http.ServerRequest, res:http.ServerResponse, callback:any):void {

    // Ignore favicon requests
    if (req.url === '/favicon.ico') {
      res.writeHead(200, {'Content-Type': 'image/x-icon'} );
      res.end();
      return;
    }

    res.end('It Works!! Path Hit: ' + req.url);

    var postData = [];

    // Gather the post data.
    if (req.method == 'POST') {
      // Gather the post data
      req.on('data', function(chunk) {
        postData.push(chunk);
      });
      // Trigger the main logic after POST data has been received.
      req.on('end', function() {
        callback(postData);
      });
    }

  }

  /** 
   * `postDataReceived()` sets the class properties after the server finished receiving the post data. It then activates `main()`.
   */
  private postDataReceived(data:any):void {

    // Set the class properties
    this.POST = JSON.parse(Buffer.concat(data).toString());

    this.ORIGIN = this.POST.repository.url;

    this.DEPLOY_CONFIG = this.getDeployConfig();

    // Test if a target config matches the post data
    if (this.TARGET_CONFIG = this.getTargetConfig()) {
      // Test if the current post request meets the deploy conditions specified in the config
      if (this.isTriggered()) {
        // Run the main deploy logic
        this.boot();
      }
    }

  }

  /** 
   * `getDeployConfig()` matches a repository name from the server config with the current post data object repository name and returns the matched object.
   */
  private getDeployConfig():any {
    // Loop through each repository in the configuration
    for (var x = 0; x < this.SERVER_CONFIG.repositories.length; x++) {
      // Check if the name matches the repo name triggered by the post data
      if (this.SERVER_CONFIG.repositories[x].name === this.POST.repository.name) {
        return this.SERVER_CONFIG.repositories[x];
      }
    }
  }

  /** 
   * `getTargetConfig()` branch ref from the server config with the current post data object repository name and returns the matched object.
   */
  private getTargetConfig():any {
    // Loop through that repos target branches and try to match to the target branch sent by the post data
    for (var i = 0; i < this.DEPLOY_CONFIG.targets.length; i++) {
      // If the repo has a matching branch, return the value of the target_key
      if (this.DEPLOY_CONFIG.targets[i].ref === this.POST.ref) {
        return this.DEPLOY_CONFIG.targets[i];
      }
    }
    return false;
  }

  /** 
   * `isTriggered()` checks if the POST properties hook conditions meet those configured for triggering a deployment.
   */
  private isTriggered() {
    var hooks = Object.keys(this.TARGET_CONFIG.hooks);
    var truth = [];
    for (var index in hooks) {
      var hook = hooks[index];
      if (this.POST[hook]) {
        if (this.POST[hook] === this.TARGET_CONFIG.hooks[hook]) {
          truth.push(true);
        }
      }
    }
    return ( hooks.length === truth.length );
  }

  /** 
   * `boot()` reads the server mode from the config and activates the proper logic for that mode.
   */
  private boot():void {
    // use the server mode as an function call
    var name = "mode"+_.capitalize(this.SERVER_CONFIG.server.mode);
    var fn = this[name];
    if (typeof fn === 'function') {
        this[name]();
    } else {
      console.log("Server mode configuration is invalid.");
    }
  }

  /** 
   * `modeStandalone()` will attempt to clone the repo, pull the latest branch, set the remote URL, and push the branch to it.
   */
  private modeStandalone():void {

    // Try to clone the git repo
    this.gitClone( (status) => {

      // Check its status for a success or failure and run callbacks
      this.statusCheck(status,
        () => {
          // Make sure the remote for deploying is set.
          this.gitSetRemote( () => {
            // Push to the deploy remote.
            this.gitPushToDeploy();
          });
        },
        () => {
          // Pull the current branch
          this.gitPullMaster( (status) => {
            // Push to the deploy remote
            this.gitPushToDeploy();
          });
        }
      );
    });
  }

  /** 
   * `modeLocal()` will set a remote on the repo existing on GitLab and then push it to that newly created remote.
   */
  private modeLocal():void {
    // Set the production remote
    // Push the branch to the production remote
    this.gitSetRemote( (status) => {
      this.gitPushToDeploy();
    });
  }

  /** 
   *  `statusCheck()` checks if the status from a shell exec is success or fail and triggers the appropriate callback.
   */
  private statusCheck(status:number, success?:Callback, fail?:Callback) {
    if (status === 0) {
      success();
    } else {
      fail();
    }
  }

  /** 
   *  `gitPushToDeploy()` runs a `git push` command from the target repo to the set `deploy` remote.
   */
  private gitPushToDeploy(callback?:StatusCallback):void {
    shell.exec('cd repos/'+this.DEPLOY_CONFIG.name+' && git push deploy master --force', function (status, output, err) {
      console.log( (status === 0 ? "Deployed successfully." : "Failed to push to the deploy server!") );
      if (callback) {
        callback(status);
      }
    });
  }

  /** 
   *  `gitPullMaster()` runs a `git pull` command from the target repo to the `./repos` directory.
   */
  private gitPullMaster(callback?:StatusCallback):void {
    shell.exec('cd repos/'+this.DEPLOY_CONFIG.name+' && git pull origin master', function (status, output, err) {
      console.log( (status === 0 ? "Remote branch pulled successfully." : "Remote pull is already up to date.") );
      if (callback) {
        callback(status);
      }
    });
  }

  /** 
   *  `gitSetRemote()` set the git remote URL for deploying the project.
   */
  private gitSetRemote(callback?:StatusCallback):void {
    shell.exec('cd repos/'+this.DEPLOY_CONFIG.name+' && git remote add deploy '+this.TARGET_CONFIG.deploy_url, function (status, output, err) {
      console.log( (status === 0 ? 'Remote named "deploy" set.' : "Remote already exists.") );
      if (callback) {
        callback(status);
      }
    });
  }

  /** 
   *  `gitClone()` clones the target repo received in the post data to the `./repos` directory.
   */
  private gitClone(callback?:StatusCallback):void {
    shell.exec('cd repos && git clone '+this.ORIGIN+' '+this.DEPLOY_CONFIG.name, function(status, output, err) {
      console.log( (status === 0 ? "Repository cloned successfully." : "Repository already cloned.") );
      if (callback) {
        callback(status);
      }
    });
  }

}

