# Supported Platforms

- OS:
  - Ubuntu 18.04 and higher
- ROS:
  - The TR agent does not require ROS to be installed. Most capabilities target ROS1 (melodic or noetic), but may also work without any ROS installed on the system.
- Hardware architectures:
  - x86_64 (Intel, AMD), and
  - arm64 (e.g., NVIDIA Jetson).

### Prerequisites

Make sure the `build-essential` package is installed as it is required by some capabilities to install:
```
sudo apt-get install build-essential
```
All other requirements are installed locally in `~/.transitive` by the capabilities themselves.

### Running in virtual environments

If testing in a virtual environment, make sure a complete Ubuntu environment is available including:
- `systemd`, used for starting capabilities in a user service,
- `apt`, used for download dependencies, which are unpacked locally,
- `curl`, used for downloading the Transitive Robotics agent, and
- `loginctl`, used to enable user services to start without logging in.

A great way to test is using [lxd containers](https://ubuntu.com/server/docs/containers-lxd).

:::note

Note that `sudo` is *not* required. So you can also just test as an unpriviledged user directly on your metal if you prefer. Also see the section on [Security](./security).

:::
