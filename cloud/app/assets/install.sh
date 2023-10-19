# Install script for robots
# We assume the shell is bash.


set -e

BLACK="\033[30m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
PINK="\033[35m"
CYAN="\033[36m"
WHITE="\033[37m"
NORMAL="\033[0;39m"

ARCH=$(dpkg --print-architecture)
# NODEURL=https://deb.nodesource.com/node_16.x/pool/main/n/nodejs/nodejs_16.14.2-deb-1nodesource1_${ARCH}.deb
# no longer available! now self hosting:
# NODEURL=https://transitiverobotics.com/static/nodejs_16.20.2-1nodesource1_${ARCH}.deb
#
# NODEURL=https://public-package-repo.s3.us-west-2.amazonaws.com/nodejs_16.20.2-1nodesource1_${ARCH}.deb
# also works:
NODEURL=https://deb.nodesource.com/node_16.x/pool/main/n/nodejs/nodejs_16.20.2-deb-1nodesource1_${ARCH}.deb
NODEDEB=/tmp/transitive_nodejs16.deb
DIR=~/.transitive
NODE=$DIR/usr/bin/node
NPM="$NODE $DIR/usr/bin/npm"
FLAG_FILE=$DIR/.installation_complete

err_report() {
  printf "\n${RED}The install script failed on line $1$NORMAL\n"
}
trap 'err_report $LINENO' ERR

printStep() {
  printf "\n$GREEN$@$NORMAL\n"
}

# printStep "Verifying dependencies"
# if ! dpkg -l build-essential | grep build-essential > /dev/null; then
#   echo '*** Missing dependencies. Please run "sudo apt-get install build-essential"'
#   exit 1;
# fi;

if [[ ! -e $FLAG_FILE ]]; then
  echo
  echo "Installing Transitive Robotics robot-agent"

  # Install node.js
  printStep "Installing node.js"
  if [ ! -e $NODEDEB ]; then
    echo "  downloading node.js"
    curl -f --progress-bar $NODEURL -J -o $NODEDEB
  else
    echo "  node.js already downloaded, reusing existing"
  fi;

  # unpack into our folder
  mkdir -p $DIR
  cd $DIR
  echo "  unpacking nodejs into $DIR"
  dpkg -x $NODEDEB .

  # Record the fact that we have locally installed node.js. This is important
  # so that packages cannot request a lower version to be installed over it. See
  # aptLocal.sh.
  mkdir -p var/lib/dpkg/status.d
  dpkg-deb -e $NODEDEB var/lib/dpkg/status.d/nodejs
  echo "Status: install ok installed" >> var/lib/dpkg/status.d/nodejs/control
  echo "" >> var/lib/dpkg/status.d/nodejs/control

  printStep "Downloading files"
  curl -sf [install_host_url]/files/package.json -o package.json
  curl -sf [install_host_url]/files/.npmrc -o .npmrc
  curl -sf [install_host_url]/files/.env -o .env

  echo "TR_USERID=[id]" >> .env
  echo "TR_INSTALL_HOST=[install_host_url]" >> .env
  echo "TR_ROBOT_TOKEN=[token]" >> .token

  # make sure we have the github.com host key file, so ssh fetches work in npm
  # mkdir -p ~/.ssh
  # ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts

  printStep "Installing the agent"
  $NPM install > /dev/null

  printStep "Agent installed"
  touch $FLAG_FILE

else
  echo "Agent already installed, not reinstalling."
fi;

printStep "Installation complete"
if [[ -d /run/systemd/system ]]; then
  # systemd is running, so the postinstall of the robot-agent will have already
  # started it via a systemd user service
  echo "  You can verify that the agent is running using 'systemctl --user status transitive-robot.service'"

elif [docker]; then
  echo "  Docker: running preinstall"

  cd $DIR
  $NODE node_modules/\@transitive-robotics/robot-agent/docker_install.js

  mv $HOME/.transitive /transitive-preinstalled
  # This folder will get bind mounted on top of anyways, but just to avoid
  # confusion and save space, we'll clean up:
  rm -rf $HOME/.transitive/

else
  echo "  Starting agent since systemd is not running."
  cd $HOME/.transitive
  bash start_agent.sh
fi;
