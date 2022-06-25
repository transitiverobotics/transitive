A simple docker container where you can install and run the Transitive agent on a robot under Ubuntu 16.

# Usage

```
./run.sh
```
This builds the image, runs it, and puts you in a shell on it. Proceed by installing the `curl` script from your portal page to install the Transitive agent. If that is working then you can make that curl command the entry-point for the docker container, so that the agent start automatically when the docker container runs.

