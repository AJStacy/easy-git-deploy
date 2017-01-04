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
   *  `POST` stores the JSON parsed post data received from GitLab as a global variable for easy access.
   */
  private POST:any;

  /** 
   *  `SERVER_CONFIG` stores the configuration from **server.conf.json** as a global variable for easy access.
   */
  private SERVER_CONFIG:any;

  /**
   * Stores the origin as a global variable for easy access.
   */
  private ORIGIN:string;

  /**
   * Stores the repo name as a global variable for easy access.
   */
  private NAME:string;

  /**
   * Stores the deploy URL as a global variable for easy access.
   */
  private DEPLOY:string;

  constructor(config:any) {

    this.SERVER_CONFIG = config;

    var self = this;
    /** 
     *  `server` stores the new http server instance.
     */
    var server:http.Server = http.createServer(this.handleRequest);

    /** 
     *  Starting up our http server at the port specified in the `SERVER_CONFIG`.
     */
    server.listen(this.SERVER_CONFIG.server.port, function() {
      //Callback triggered when server is successfully listening. Hurray!
      console.log("Server listening on: http://localhost:%s", self.SERVER_CONFIG.server.port);
    });
  }

  /** 
   *  `handleRequest()` handles receiving http requests and POST data.
   */
  private handleRequest(req:http.ServerRequest, res:http.ServerResponse):void {

    // Ignore favicon requests
    if (req.url === '/favicon.ico') {
      res.writeHead(200, {'Content-Type': 'image/x-icon'} );
      res.end();
      return;
    }

    res.end('It Works!! Path Hit: ' + req.url);

    // Gather the post data.
    if (req.method == 'POST') {
      // Gather the post data
      req.on('data', function(chunk) {
        this.POST.push(chunk);
      });
      // Trigger the main logic after POST data has been received.
      req.on('end', this.postDataReceived);
    }

  }

  private postDataReceived():void {

    // Set the class properties
    this.POST = JSON.parse(Buffer.concat(this.POST).toString());
    this.ORIGIN = this.POST.repository.url;
    this.NAME = this.POST.repository.name;
    this.DEPLOY = this.getDeployURL();

    // Start the server logic
    this.main();
  }

  /** 
   *  The main server logic. Reads the **POST** data and calls the appropriate deploy methods.
   */
  private main():void {

    if (this.POST.build_status === "success") {

      fs.mkdir('./repos', function(err) {
        // use the server mode as an function call
        var fn = "mode"+_.capitalize(this.SERVER_CONFIG.server.mode);
        fn = global[fn];
        if (typeof fn === 'function') {
            fn();
        } else {
          console.log("Server mode configuration is invalid.");
        }

      });

    }

  }

  /** 
   *  Logic for the "pull" server mode. It will attempt to clone the repo, pull the latest branch, set the remote URL, and push the branch to it.
   */
  private modePull():void {

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

  private modeLocal():void {
    // Set the production remote
    // Push the branch to the production remote
    this.gitSetRemote( (status) => {
      this.gitPushToDeploy();
    });
  }

  private statusCheck(status:number, success?:Callback, fail?:Callback) {
    if (status !== 0) {
      fail();
    } else {
      success();
    }
  }

  /** 
   *  `gitPushToDeploy()` runs a `git push` command from the target repo to the set `deploy` remote.
   */
  private gitPushToDeploy(callback?:StatusCallback):void {
    shell.exec('cd repos/'+this.NAME+' && git push deploy master --force', function (status, output, err) {
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
    shell.exec('cd repos/'+this.NAME+' && git pull origin master', function (status, output, err) {
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
    shell.exec('cd repos/'+this.NAME+' && git remote add deploy '+this.DEPLOY, function (status, output, err) {
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
    shell.exec('cd repos && git clone '+this.ORIGIN+' '+this.NAME, function(status, output, err) {
      console.log( (status === 0 ? "Repository cloned successfully." : "Repository already cloned.") );
      if (callback) {
        callback(status);
      }
    });
  }

  private getDeployURL():string {
    return this.getRepoConfigValue("deploy_url");
  }

  private getRepoConfigValue(target_key:string):string {
    for (var x = 0; x < this.SERVER_CONFIG.repositories.length; x++) {
      if (this.SERVER_CONFIG.repositories[x].name === this.NAME) {
        return this.SERVER_CONFIG.repositories[x][target_key];
      }
    }
  }

} // End Class Server

