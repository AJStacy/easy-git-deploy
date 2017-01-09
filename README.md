# GLAD

What is GLAD? It is a GitLab Auto Deploy server. Will it make me glad? Hopefully.

## How does it work?

GLAD is a simple typescript Node server that executes a series of Git commands based on GitLab webhooks and GLAD's own internal configuration.

To execute a deployment it goes through the following cycle:
1. Receive the webhook from GitLab to trigger the deploy process.
2. Compares the webhook data against the GLAD server config.
3. If the webhook data matches the config it then clones the repo, sets a remote for the deploy destination, and pushes the matched branch.

Here is an image representation:

![Flow Chart](/images/flowchart.png)

## Setup Requirements

In order for GLAD to properly deploy you'll first need to set up a "bare" Git repository on the target server.


