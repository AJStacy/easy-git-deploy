var http = require('http');
var util = require('util');
var shell = require('shelljs');
var fs = require('fs');

/** 
 *  `POST` stores the post data received from GitLab.
 */
POST = {};

/** 
 *  `SERVER_CONFIG` stores the configuration from **server.conf.json**.
 */
SERVER_CONFIG = require('./config.json');

/** 
 *  The main server logic. Reads the **POST** data and calls the appropriate deploy methods.
 */
function main() {

  console.log("Made it to main.", POST.build_status);

  if (POST.build_status === "success") {

    console.log("BUILD STATUS SUCCESS");

    fs.mkdir('./repos', function(err) {

      console.log("Server Config: ",SERVER_CONFIG.server.mode);
      if (SERVER_CONFIG.server.mode === "pull") {
        console.log("SERVER MODE PULL");
        // Clone the repo
        // Set the production remote
        // Pull the latest branch
        // Push to the git remote
        gitClone(function (status) {
          statusCheck(status,
            function() {
              console.log("Cloned the repo.");
              gitSetRemote(function() {
                console.log("REMOTE SET");
                gitPushToDeploy(function() {
                  console.log("Pushed");
                });
              });
            },
            function() {
              console.log("Repo already exists.");
              gitPullMaster(function() {
                console.log("Pulled the master branch.");
                gitPushToDeploy(function() {
                  console.log("Pushed");
                });
              });
            }
          );
        });
      } else if (SERVER_CONFIG.server.mode === "local") {
        // Set the production remote
        // Push the branch to the production remote
      }
    });

  }

}

function statusCheck(status, success, fail) {
  if (status !== 0) {
    fail();
  } else {
    success();
  }
}

/** 
 *  `gitPushToDeploy()` runs a `git push` command from the target repo to the set `deploy` remote.
 */
function gitPushToDeploy(callback) {
  shell.exec('cd repos/'+NAME+' && git push deploy master --force', function (status, output, err) {
    if (status === 0) {
      console.log("Deployed successfully!");
    }
    callback();
  });
}

/** 
 *  `gitPullMaster()` runs a `git pull` command from the target repo to the `./repos` directory.
 */
function gitPullMaster(callback) {
  shell.exec('cd repos/'+NAME+' && git pull origin master', function (status, output, err) {
    callback();
  });
}

/** 
 *  `gitSetRemote()` set the git remote URL for deploying the project.
 */
function gitSetRemote(callback) {
  shell.exec('cd repos/'+NAME+' && git remote add deploy '+DEPLOY, function (status, output, err) {
    if (status !== 0) {
      console.log("Remote already exists.");
    }
    callback();
  });
}

/** 
 *  `gitClone()` clones the target repo received in the post data to the `./repos` directory.
 */
function gitClone(callback) {
  shell.exec('cd repos && git clone '+ORIGIN+' '+NAME, function(status, output, err) {
    console.log(output);
    callback();
  });
}

/** 
 *  `handleRequest()` handles receiving http requests and POST data.
 */
function handleRequest(req, res) {

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
      POST += chunk.toString();
    });
    // Trigger the main logic after POST data has been received.
    req.on('end', function() {
      console.log(POST);
      main();
    });
  }

}

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

