var http = require('http');
var util = require('util');
var shell = require('shelljs');
var jsonBody = require("body/json");
var _ = require("lodash");
var fs = require('fs');

/** 
 *  `POST` stores the JSON parsed post data received from GitLab as a global variable for easy access.
 */
POST = [];

/** 
 *  `SERVER_CONFIG` stores the configuration from **server.conf.json** as a global variable for easy access.
 */
SERVER_CONFIG = require('./config.json');

/**
 * Stores the origin as a global variable for easy access.
 */
ORIGIN = "";

/**
 * Stores the repo name as a global variable for easy access.
 */
NAME = "";

/**
 * Stores the deploy URL as a global variable for easy access.
 */
DEPLOY = "";

/** 
 *  The main server logic. Reads the **POST** data and calls the appropriate deploy methods.
 */
function main() {

  if (POST.build_status === "success") {

    fs.mkdir('./repos', function(err) {

      // use the server mode as an function call
      var fn = "mode"+_.capitalize(SERVER_CONFIG.server.mode);
      var fn = global[fn];
      if(typeof fn === 'function') {
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
modePull = function() {

  // Try to clone the git repo
  gitClone(function (status) {

    // Check its status for a success or failure and run callbacks
    statusCheck(status,
      () => {
        // Successfully cloned.

        // Make sure the remote for deploying is set.
        gitSetRemote( (status) => {
          
          // Push to the deploy remote.
          gitPushToDeploy( (status) => {
            console.log( (status === 0 ? "Deployed successfully." : "Failed to push to the deploy server!") );
          });
        });
      },
      () => {
        // Failed to clone the repo, likely because it exists or the remote connection was invalid.
        console.log("Repo already exists or the remote connection was invalid.");

        gitPullMaster((status) => {
          statusCheck(status, () => {
            gitPushToDeploy();
          }, () => console.log("Failed to pull the branch. Aborting.") );
        });
      }
    );
  });
}

modeLocal = function() {
  // Set the production remote
  // Push the branch to the production remote
  gitSetRemote( (status) => {
    gitPushToDeploy();
  });
}

statusCheck = function(status, success, fail) {
  if (status !== 0) {
    fail();
  } else {
    success();
  }
}

/** 
 *  `gitPushToDeploy()` runs a `git push` command from the target repo to the set `deploy` remote.
 */
gitPushToDeploy = function(callback) {
  shell.exec('cd repos/'+NAME+' && git push deploy master --force', function (status, output, err) {
    console.log( (status === 0 ? "Deployed successfully." : "Failed to push to the deploy server!") );
    if (typeof callback === 'function') {
      callback();
    }
  });
}

/** 
 *  `gitPullMaster()` runs a `git pull` command from the target repo to the `./repos` directory.
 */
gitPullMaster = function(callback) {
  shell.exec('cd repos/'+NAME+' && git pull origin master', function (status, output, err) {
    if (typeof callback === 'function') {
      callback();
    }
  });
}

/** 
 *  `gitSetRemote()` set the git remote URL for deploying the project.
 */
gitSetRemote = function(callback) {
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
gitClone = function(callback) {
  shell.exec('cd repos && git clone '+ORIGIN+' '+NAME, function(status, output, err) {
    console.log(output);
    if (typeof callback === 'function') {
      callback();
    }
  });
}

/** 
 *  `handleRequest()` handles receiving http requests and POST data.
 */
handleRequest = function(req, res) {

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
      POST.push(chunk);
    });
    // Trigger the main logic after POST data has been received.
    req.on('end', function() {
      // SET THE GLOBALS
      POST = JSON.parse(Buffer.concat(POST).toString());
      ORIGIN = POST.repository.url;
      NAME = POST.repository.name;
      DEPLOY = getDeployURL();
      main();
    });
  }

}

getDeployURL = function() {
  return getRepoConfigValue("deploy_url");
};

getRepoConfigValue = function(target_key) {
  for (var x = 0; x < SERVER_CONFIG.repositories.length; x++) {
    if (SERVER_CONFIG.repositories[x].name === NAME) {
      return SERVER_CONFIG.repositories[x][target_key];
    }
  }
};

/** 
 *  `server` stores the new http server instance.
 */
var server = http.createServer(handleRequest);

/** 
 *  Starting up our http server at the port specified in the `SERVER_CONFIG`.
 */
server.listen(SERVER_CONFIG.server.port, function() {
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", SERVER_CONFIG.server.port);
});

