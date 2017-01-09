# GLAD

What is GLAD? It is a GitLab Auto Deploy server. Will it make me glad? Hopefully.

## How does it work?

GLAD is a simple typescript Node server that executes a series of Git commands based on GitLab webhooks and GLAD's own internal configuration.

To execute a deployment it goes through the following cycle:

1. Receive the webhook from GitLab to trigger the deploy process.
2. Compares the webhook data against the GLAD server config.
3. If the webhook data matches the config it then clones the repo, sets a remote for the deploy destination, and pushes the matched branch to a bare Git remote.

If you have any questions, please refer the FAQ's section at the bottom.

Here is an image representation:

![Flow Chart](/images/flowchart.png)

## Server Requirements

+ Node v4.4+ ([install instructions](https://nodejs.org/en/download/package-manager/))
+ Git v2.9+ ([install instructions](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git))

## Setup

First, we must install GLAD on our server. The easiest method is it use Git to clone this repo to our home folder. The following command will clone the repo in your home folder and automatically navigate you into it.

    cd ~/ && git clone https://github.com/AJStacy/git-glad.git git-glad && cd git-glad

Once we have cloned the repo, we need to create a configuration in `config.json`. Let's start by copying the `example.config.json` at the server root folder and renaming it:

    cp example.config.json config.json

Now open the config.json in an editor and modify the values to suit your project needs. Reference the "Configuration" section below for info on what each value does.

Once you have it configured we can run the server with a simple Node command:

    node index.js

However, if you would like the server to run indefinitely as a background process, simply pass a `-d` command flag to enable **daemon mode**.

    node index.js -d

## Configuration

#### "server"

The basic server configuration.

Key | Default | Explanation
--- | ------- | -----------
"port" | 1988 | The port number on which the server runs.
"timestamp_format" | "MM:DD:YYYY - HH:mm" | The format for timestamps in the logs.
"deploy_remote_name" | "glad-deploy" | The remote name set on the cloned repo before the branch is pushed. (You probably will never change this).

#### "repositories"

An **Array** of **Objects** representing repositories which can be auto deployed.

Key | Explanation
--- | -----------
"name" | The name of the repository that can trigger an auto deploy.
"targets" | An **Array** of **Objects** containing branch definitions that can trigger an auto deploy.

#### "targets"

Key | Explanation
--- | -----------
"ref" | The name of the branch within this repo that can trigger an auto deploy.
"deploy_url" | The remote deploy URL. (Points to a bare repo)
"hooks" | An object containing key/value pairs that must match the GitLab webhook data in order for an auto deploy to be triggered.

### Server Configuration Example


    {
      "server": {
        "port": 1988,
        "timestamp_format": "MM:DD:YYYY - HH:mm"
      },
      "repositories": [
        {
          "name": "my-project",
          "targets": [
            {
              "ref": "master",
              "deploy_url": "ssh://git@production.com/var/repo/my-project.git",
              "hooks": {
                "object_kind": "build",
                "build_status": "success"
              }
            },
            {
              "ref": "test",
              "deploy_url": "ssh://git@test.com/var/repo/my-project.git",
              "hooks": {
                "object_kind": "build",
                "build_status": "success"
              }
            }
          ]
        },
        {
          "name": "my-project-2",
          "targets": [
            {
              "ref": "master",
              "deploy_url": "ssh://git@other-production.com/var/repo/my-project-2.git",
              "hooks": {
                "object_kind": "build",
                "build_status": "success"
              }
            }
          ]
        }
      ]
    }

## FAQ's

#### What is a "bare" Git repository?

It loosely is a remote server that receives and distributes Git data. When you create a "New Project" on GitLab, behind the scenes GitLab is actually generating a "bare" Git repo that you push your branches to.

#### Why do I need to setup a bare repo on my server?

As a standard for doing automated deployments via Git, many users will create a bare repo that they can directly push their Git branches to. This bare repo will then have a **"post-receive"** hook set that will run a build script and ultimately place the project files where they need to be.

Rather than move away from this common practice, GLAD simply aims to be an easy middleman between GitLab and your server that simply pushes branches when certain criteria are met.

#### How do I create a bare repo?

This is outside of the scope of this documentation, but a good and simple tutorial can be found [here](https://ma.ttias.be/simple-git-push-workflow-deploy-code-server/).
