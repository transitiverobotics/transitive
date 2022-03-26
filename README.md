

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


# [intended] Installation

Install dependencies: mosquitto, mongodb, node.js.

**TODO**: how to set configuration for mosquitto (and download auth-plugin)? a configure script as part of `@transitive-robotics/cloud`? a postinstall script, and require sudo? require `sudo npm -g install`?
 - yes, also needed to create `master` user and password (stored as bcrypt hash in db)
 - or just do everything via docker-compose or similar?
 - when and where to generate master certs for mqtt? 

On your cloud server run
```
npm install @transitive-robotics/cloud
```


# [intended] Setup

1. use the CLI tool to create a new account
1. start the cloud agent (`npx transitive [--dev]`)
1. open cloud interface (in dev at http://localhost:8000, in production at https://your-hostname)
  1. log in and go to your fleet page
  1. copy the curl command
1. ssh into your robot or other device
1. paste and execute the curl command
1. develop a package, then
  1. log into your local registry by running `npm login --registry=http://localhost:6000`
    - enter your account credentials
  1. publish your package to your local registry by running `npm publish`
    - there should be a `.npmrc` file in your project folder that sets your local registry for your scope
