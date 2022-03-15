# Security

### Sandboxing

Capabilities installed on your devices are executed in a sandboxed environment using `unshare`. The constructed sandbox hides sensitive information from the capabilities such as your TR certificates (in `.transitive/certs`), all home directories, and `/var`, and runs as user `nobody`.

This does not currently use any virtualization technology like LXD or Docker and hence no software needs to be installed beyond what Ubuntu already installs by default. It also means that `sudo` is not required at any point in time.

The Transitive Robotics agent runs as the user you installed it with using the `curl` command from your fleet page. If you further want to increase security, you can create a new user just for this purpose and install the agent as that user instead.

### Cloud communications

The Transitive Robotics platform communicates with transitiverobotic.com for both operational (data transmitted by running capabilities) and administrative purposed (information shown on and received from the portal). Naturally, all such communication is done over HTTPs.



### Uninstalling

If you ever wish to uninstall the Transitive agent and all installed capabilities again, execute `~/.transitive/uninstall.sh`.
