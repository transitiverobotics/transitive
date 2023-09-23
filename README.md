*Disclaimer: This is a preview of the actual open-source release we will make. Do not yet build on top of this repo, since the git commit history will change again in the future.*


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
- In *development*:
  ```sh
  ./dev.sh
  ```
  Then go to http://portal.localhost:8000
- In *production*:
  ```sh
  docker-compose build
  docker-compose up -d
  ```
  Then go to http://portal.YOUR-DOMAIN.NAME

From the portal you can add robots and other devices just like with the hosted version, i.e., by executing the `curl` command shown there.

## Get in Touch

We love to collaborate! We welcome all comments, questions, and suggestions. Please join the Slack community: https://transitiverobotics.com/slack.

## License

Apache 2.0.
