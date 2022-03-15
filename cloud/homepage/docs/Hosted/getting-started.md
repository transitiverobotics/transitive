import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export const Test = () => {
  const {siteConfig: {customFields}} = useDocusaurusContext();
  return <span>{customFields.isDevelopment ? 'Dev!' : 'prod'}</span>
};

# Getting Started

Test: <Test />

Start by [registering for a free account](/register). Once registered, you can start using Transitive Robotics by:
1. Installing the agent by running the `curl` command from your [Fleet page](/fleet),
2. Installing a capability from the [Capabilities page](/caps), and
3. Embedding the HTML snippet provided by the capability on the device page in your own web application.

These steps are now explained in more detail.

### Installing the agent

Once you have an account and are logged in, head to the [Fleet page](/). The fleet page shows you all your connected devices. Most of these will be robots, but also other devices such as on-premise servers might be listed here. To add devices to your account, find the `curl` command at the top of the page and execute it on your device. We currently support devices running Ubuntu 18.04 or 20.04 on amd64 or arm64.

:::note In case you are curious

The URL in the command contains your user `id` and your secret `token`. This token grants permission to connect to your account. While it is unlikely anyone would want to grant access to their robots to you by stealing *your* token and executing this command on *their* robots, you may still want to keep that token a secret.

:::

The `curl` command fetches the install script from our servers and runs it. It installs the Transitive Robotics agent in `~/.transitive` and adds a systemd user service to start it on boot. The agent is responsible for providing very basic status information about your device and for installing and starting capabilities. If you ever want to remove the agent, its services, and all capabilities it has installed, you can use the `~/.transitive/usr/bin/uninstall.sh` script included.

Once the agent is installed you will see your device on your Fleet page.

:::note A word about ROS

Several of the capabilities available from Transitive Robotics rely on ROS and hence require a ros-master to be running. If the agent discovers that ROS is not installed, it will install a minimal set of ROS components to run a master. This master (roscore) will be started on boot of the user service if no other master is running yet at that time.

:::

### Installing a capability
Once the agent is installed on your device and you see it on the Fleet page you can install a first capability. For that head to your [Fleet page](/) and select the device you want to add a capability on. Under Capabilities select the desired capability from the "Install" dropdown.

This will add the selected capability to the list of desired capabilities on that robot. When the robot-agent on that robot receives the updated list, it will compare the list of currently installed capability with the desired ones and make all necessary changes, in the case here installing the newly selected capability. Depending on the capability and the involved dependencies this can take a short while but not usually longer than a couple of minutes.

:::tip About system dependencies

Some users may wonder how Transitive Robotics handles dependencies given that the robot-agent is running as an ordinary user without `sudo` priviledges. The answer is that the agent locally installs required Ubuntu packages that are not already found on the system. These packages are placed in subfolders of `~/.transitive` and are shared between capabilities.

:::

Each capability runs in its own sandbox environment on the robot and is started by a separate systemd user service `transitive-package@PACKAGE_NAME`.

Once the chosen capability is installed and started running, it will show up as "running" on the device page. If the capability provides a front-end component it will be shown on the device page as well. The display of the front-end component (also referred to as widget), is primarily for demonstration purposes. Their intended purpose is for embedding in your own robotic web application.

### Embedding a capability's widget in your own web application

All front-end components show on device pages come with embedding instructions. These instructions describe how the shown component can be embedded in other web application. All these instructions share the following format:

```html
<script src="URL-to-components-js-file"></script>
<name-of-the-capability id="YOUR-USER-ID" jwt="JWT" />
```

where `JWT` is a [JWT token](https://jwt.io/) signed with your JWT secret carrying a specific payload. You can find your JWT secret on your [Security page](/security). To get you started quickly with testing these front-end components, the instructions also include an HTML snippet like the above with a pre-signed JWT token valid for 12 hours. This snippet can be used to test the embedding without having to worry about signing JWTs just yet. However, in production you will need to automatically generate these tokens. They are required to let Transitive Robotics know that a user who is logged into the page where you embedded these snippets has your permission to see the content provided by the capabilities in question.

> Front-end components are packaged as [Web Components](https://developer.mozilla.org/en-US/docs/Web/Web_Components), a technology that is supported by all modern browsers, and they use a [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM) to isolate themselves from the rest of the page they are embedded into. This cleanly separates concerns and prevents style clashes.
