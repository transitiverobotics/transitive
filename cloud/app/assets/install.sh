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
NODEURL=https://deb.nodesource.com/node_16.x/pool/main/n/nodejs/nodejs_16.14.2-deb-1nodesource1_${ARCH}.deb
NODEDEB=/tmp/transitive_nodejs16.deb
DIR=~/.transitive
NODE=$DIR/usr/bin/node
NPM="$NODE $DIR/usr/bin/npm"

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
curl -sf [host]/files/package.json -o package.json
curl -sf [host]/files/.npmrc -o .npmrc
curl -sf [host]/files/.env -o .env

echo "TR_USERID=[id]" >> .env
echo "TR_INSTALL_HOST=[host]" >> .env
echo "TR_ROBOT_TOKEN=[token]" >> .token


printStep "Installing the agent"
$NPM install > /dev/null

printStep "Success!"


if [[ -d /run/systemd/system ]]; then
  # systemd is running, so the postinstall of the robot-agent will have already
  # started it via a systemd user service
  echo "  You can verify that the agent is running using 'systemctl --user status transitive-robot.service'"
else
  printStep "Installation complete"
  echo "  The agent is installed, but you don't seem to run systemd."
  echo "  You are responsible for starting the agent yourself. To do that run"
  echo "  cd $HOME/.transitive && bash start_agent.sh"
fi;
