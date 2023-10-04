<p align="center">
  <a href="https://transitiverobotics.com">
    <img src="https://transitiverobotics.com/img/logo.svg" style="height: 64px">
  </a>
</p>

# Transitive: an open-source framework for full-stack robotics

by [Transitive Robotics](https://transitiverobotics.com)

### Key Features

- Data synchronization between robot, cloud, and UI
  - Reactively re-render UI elements when data on a robot changes
- Full-stack package management
  - Notion of packages that allows sharing with third-parties
  - Deployment mechanism incl. auto-updates over-the-air
  - Handles cross-device version dependencies
- Sandboxing of capabilities
  - Both on robot and in the cloud
- UI component abstraction
  - Using [Web Components](https://www.webcomponents.org/introduction)
  - Easy to embed in other web applications
  - Easy to embed in React, Angular, etc.
- Authentication and authorization
  - For robots in the fleet
  - For web application users
  - For third-party apps

## Setup

- Go into the `cloud/` directory.
- Copy `sample.env` to `.env` and edit appropriately (variables are documented in the file itself).
- Start all services:
  - In *development*:
    - `./dev.sh`
    - Ensure all required subdomains are set up, see [below](#setting-up-subdomains).
    - Go to http://portal.localhost
  - In *production*:
    - `docker-compose build && docker-compose up -d`
    - Add all required subdomains to your DNS records as CNAMES or using a wildcard.
    - Then go to http://portal.YOUR-DOMAIN.NAME

From the portal you can add robots and other devices just like with the hosted version, i.e., by executing the `curl` command shown there.

### Setting up subdomains

In development, you need to ensure that your dev machine is reachable under all these subdomains names: `portal registry data mqtt install`. So if your `TR_HOST` in `.env` is `hostname.local`, then `portal.hostname.local`, etc., need to resolve to
`hostname.local`.

For local development, i.e., when using yout dev machine itself as a robot/device to connect to your deployment, you can simply add those to your `/etc/hosts`. If you are testing with robots and devices on your local network or in docker, we recommend using mDNS. For instance, you can use the following script to publish the alternate names on your local network using Avahi.

```sh
#!/bin/bash
# call with IP to use as argument

IP=$1
HOSTNAME=$(hostname)
ALIASES="portal registry data mqtt install"

for name in $ALIASES; do
  echo $name;
  /usr/bin/avahi-publish -a -R $name.${HOSTNAME,,}.local $IP &
done
```

## Get in Touch

We love to collaborate! We welcome all comments, questions, and suggestions. Please join the Slack community: https://transitiverobotics.com/slack.

## License

Apache 2.0.
