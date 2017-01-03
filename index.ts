/// <reference path="typings/node/node-0.12.d.ts"/>

import * as http from "http";
import * as util from "util";
import * as shell from "shelljs";
import * as jsonBody from "body/json";
import * as _ from "lodash";
import * as fs from "fs";

class GitLabAutoDeploy {

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

  constructor() {
    this.SERVER_CONFIG = require('./config.json');

    /** 
     *  `server` stores the new http server instance.
     */
    var server:http.Server = http.createServer(this.handleRequest);

    /** 
     *  Starting up our http server at the port specified in the `SERVER_CONFIG`.
     */
    server.listen(this.SERVER_CONFIG.server.port, function() {
      //Callback triggered when server is successfully listening. Hurray!
      console.log("Server listening on: http://localhost:%s", this.SERVER_CONFIG.server.port);
    });
  }

  /** 
   *  `handleRequest()` handles receiving http requests and POST data.
   */
  private handleRequest(req, res):void {

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
    // Start the server logic
    this.main();
  }

  /** 
   *  The main server logic. Reads the **POST** data and calls the appropriate deploy methods.
   */
  private main() {

    if (this.POST.build_status === "success") {

      fs.mkdir('./repos', function(err) {

        console.log("Server Config: ",this.SERVER_CONFIG.server.mode);

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

  private modePull() {

    // Try to clone the git repo
    this.gitClone(function (status) {

      // Check its status for a success or failure and run callbacks
      this.statusCheck(status,
        () => {
          // Successfully cloned.

          // Make sure the remote for deploying is set.
          this.gitSetRemote( () => {
            
            // Push to the deploy remote.
            this.gitPushToDeploy( (status) => {
              console.log( (status === 0 ? "Deployed successfully." : "Failed to push to the deploy server!") );
            });
          });
        },
        () => {
          // Failed to clone the repo, likely because it exists or the remote connection was invalid.
          console.log("Repo already exists or the remote connection was invalid.");

          this.gitPullMaster((status) => {
            this.statusCheck(status, () => {
              this.gitPushToDeploy(() => {
                
              });
            }, () => console.log("Failed to pull the branch. Aborting.") );
          });
        }
      );
    });
  }

  private modeLocal() {
    // Set the production remote
    // Push the branch to the production remote
  }

  private statusCheck(status, success, fail) {
    if (status !== 0) {
      fail();
    } else {
      success();
    }
  }

  /** 
   *  `gitPushToDeploy()` runs a `git push` command from the target repo to the set `deploy` remote.
   */
  private gitPushToDeploy(callback) {
    shell.exec('cd repos/'+this.NAME+' && git push deploy master --force', function (status, output, err) {
      console.log( (status === 0 ? "Deployed successfully." : "Failed to push to the deploy server!") );
      if (typeof callback === 'function') {
        callback();
      }
    });
  }

  /** 
   *  `gitPullMaster()` runs a `git pull` command from the target repo to the `./repos` directory.
   */
  private gitPullMaster(callback) {
    shell.exec('cd repos/'+NAME+' && git pull origin master', function (status, output, err) {
      if (typeof callback === 'function') {
        callback();
      }
    });
  }

  /** 
   *  `gitSetRemote()` set the git remote URL for deploying the project.
   */
  private gitSetRemote(callback) {
    shell.exec('cd repos/'+NAME+' && git remote add deploy '+DEPLOY, function (status, output, err) {
      if (status !== 0) {
        console.log("Remote already exists.");
      }
      if (typeof callback === 'function') {
        callback();
      }
    });
  }

  /** 
   *  `gitClone()` clones the target repo received in the post data to the `./repos` directory.
   */
  private gitClone(callback) {
    shell.exec('cd repos && git clone '+ORIGIN+' '+NAME, function(status, output, err) {
      console.log(output);
      if (typeof callback === 'function') {
        callback();
      }
    });
  }

}


