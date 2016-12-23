var http = require('http');
var util = require('util');
var shell = require('shelljs');
var fs = require('fs');

// Create containers for executed command threads
var git_clone;
var git_push;

//Lets define a port we want to listen to
const PORT = 1988;
const NAME = "submission-portal-v2";
const ORIGIN = "git@10.16.0.190:stratacache/submission-portal-v2.git";
const DEPLOY = "ssh://git@10.16.0.148/var/repo/subPortalTest.git";

function getPostData() {
  var POST = {};
  if (req.method == 'POST') {
    req.on('data', function(data) {
      data = data.toString();
      data = data.split('&');
      for (var i = 0; i < data.length; i++) {
        var _data = data[i].split("=");
        POST[_data[0]] = _data[1];
      }
      return POST;
    });
  }
}

function gitPushToDeploy() {
  shell.exec('cd repos/'+NAME+' && git push deploy master --force', function (status, output, err) {
    if (status === 0) {
      console.log("Deployed successfully!");
    }
  });
}

function gitPullMaster() {
  shell.exec('cd repos/'+NAME+' && git pull origin master', function (status, output, err) {
    gitPushToDeploy();
  });
}

function gitSetRemote() {
  shell.exec('cd repos/'+NAME+' && git remote add deploy '+DEPLOY, function (status, output, err) {
    if (status !== 0) {
      console.log("Remote already exists.");
    }
    gitPushToDeploy();
  });
}

function gitClone() {
  shell.exec('cd repos && git clone '+ORIGIN+' '+NAME, function(status, output, err) {
    console.log(output);
    if (status !== 0) {
      console.log("Repo already cloned.");
      gitPullMaster();
    } else {
      gitSetRemote();
    }
  });
}

//We need a function which handles requests and send response
function handleRequest(request, response) {

  var post_data = getPostData(request);
  console.log(post_data);

  // Ignore favicon requests
  if (request.url === '/favicon.ico') {
    response.writeHead(200, {'Content-Type': 'image/x-icon'} );
    console.log("favicon requested");
    response.end();
    return;
  }

  response.end('It Works!! Path Hit: ' + request.url);

  if (post_data == "success") {
    fs.mkdir('./repos', function(err) {
      gitClone();
    });
  }

}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(PORT, function() {
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", PORT);
});

