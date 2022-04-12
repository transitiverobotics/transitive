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

### Running in docker

#### Build

Using a docker image derived from Ubuntu 18+ (e.g., `ros:melodic`), install dependencies: `apt-get install curl git lsb-release gnupg`.

#### Run

- Since Transitive uses linux namespaces to sanbox capabilities, you need to run your container with `--privileged`.
- Inside your container, `$HOME/.transitive` needs should be a bind-mounted folder from your host. For instance, run `mkdir /tmp/transitive-docker` and run your container with `-v /tmp/transitive-docker:/root/.transitive`, if running as root inside your container. (This is required for two reasons: to give Transitive a place where it can permanently store files, and to allow usage of this folder for creating an overlayfs mount onto /usr inside the container.)
- Make sure, `/etc/machine-id` is not empty, e.g., run `hostname > /etc/machine-id` as part of your entry point.


### Running in virtual environments

If testing in a virtual environment, make sure a complete Ubuntu environment is available including:
- `systemd`, used for starting capabilities in a user service,
- `loginctl`, used to enable user services to start without logging in,
- `apt`, used for download dependencies, which are unpacked locally, and
- `curl`, used for downloading the Transitive Robotics agent, and
- `lsb-release` and `gnupg`.

A great way to test Transitive is by using [lxd containers](https://ubuntu.com/server/docs/containers-lxd).

:::note

Note that `sudo` is *not* required. So you can also just test as an unpriviledged user directly on your development machine if you prefer. Also see the section on [Security](./security).

:::
