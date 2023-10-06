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

> ### Regarding Subdomains
> Transitive uses a number of subdomains, such as "portal." and "data.". In production you need to make sure they all resolve for your domain to your host. In development, the COMPOSE_PROFILES variable in .env should be set to "dev", in which case it will start a small mDNS service to take care of it. Just make sure your machine and any local robots you are testing with can resolve mDNS domains. On Ubuntu this is usually the case when the libnss-mdns package is installed. You may need to enable mdns4 in your /etc/nsswitch.conf. <br/>&nbsp;


## Get in Touch

We love to collaborate! We welcome all comments, questions, and suggestions. Please join the Slack community: https://transitiverobotics.com/slack.

## License

Apache 2.0.
