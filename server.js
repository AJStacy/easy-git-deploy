var http = require('http');
var util = require('util');
var shell = require('shelljs');
var fs = require('fs');

// Create containers for executed command threads
var git_clone;

//Lets define a port we want to listen to
const PORT = 1988;
const ORIGIN = "git@10.16.0.190:stratacache/submission-portal-v2.git";
const DEPLOY = "ssh://git@10.16.0.148/var/repo/subPortalTest.git";

function gitClone() {
  git_clone = shell.exec('git clone '+ORIGIN+' /repos', {async: true});
  git_clone.stdout.on('data', function(data) {
    echo(data);
  });
}

//We need a function which handles requests and send response
function handleRequest(request, response) {
  response.end('It Works!! Path Hit: ' + request.url);
  if (!fs.existsSync('./repos')) {
    shell.mkdir('./repos');
  }
  gitClone();
}




//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(PORT, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", PORT);
});

