var http = require('http');
var util = require('util');
var shell = require('shelljs');
var fs = require('fs');

// Get the Server Config
var SERVER_CONFIG = require('./server.conf.json');

// Create containers for executed command threads
var CONFIG;

function matchConfigs(name) {
  for (var index in SERVER_CONFIG.repos) {
    if (SERVER_CONFIG.repos[index].name === name) {
      return index;
    }
  }
  return false;
}

function setWebHookData(post_data) {

  var config_match_index;
  if ( config_match_index = matchConfigs(post_data.repository.name) ) {
    CONFIG = {
      name: post_data.repository.name,
      origin: post_data.repository.git_http_url,
      deploy: SERVER_CONFIG.repos[config_match_index].deploy_url
    };
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
function handleRequest(req, res) {

  // Ignore favicon requests
  if (req.url === '/favicon.ico') {
    res.writeHead(200, {'Content-Type': 'image/x-icon'} );
    console.log("favicon requested");
    res.end();
    return;
  }

  res.end('It Works!! Path Hit: ' + req.url);

  // Gather the post data
  if (req.method == 'POST') {
    POST = '';
    req.on('data', function(chunk) {
      POST += chunk.toString();
      console.log(POST);
    });
    req.on('end', function() {
      if (POST.build_status === "success") {
        setWebHookData()
        fs.mkdir('./repos', function(err) {
          gitClone();
        });
      }
    });
  }

}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(SERVER_CONFIG.port, function() {
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", SERVER_CONFIG.port);
});

