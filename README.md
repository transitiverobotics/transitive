*Disclaimer: This is a preview of the actual open-source release we will make. Do not yet build on top of this repo, since the git commit history will change again in the future.*


<p align="center">
  <a href="https://transitiverobotics.com">
    <img src="https://transitiverobotics.com/img/logo.svg" style="height: 64px">
  </a>
</p>

# Transitive: an open-source framework for full-stack robotics

by [Transitive Robotics](https://transitiverobotics.com)

# Key Features

- data synchronization between robot, cloud, and UI (like Meteor)
  - roadmap: RPC across robot, cloud, UI
- provides full-stack-package management (like Debian/ROS, but cross-device)
  - package definition (allows sharing of packages with third-party developers)
  - deployment mechanism
  - handles cross-device version dependencies
- sandboxing of third-party capabilities (like iOS and Android)
  - both on robot/device and cloud
- UI component abstraction (web components)
- authentication and authorization
  - for robots in the fleet
  - for web application users
  - for third-party apps


# Setup

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
