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
FLAG_FILE=$DIR/installation_complete
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

if [[ ! -f $FLAG_FILE ]]; then

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

  printStep "Generating SSL certificates"

  echo "  computing hashed machine-id"
  # compute sha256sum of machine-id, take first 10 chars of it's base64 encoding,
  # with special characters removed
  ID=$(cat /etc/machine-id)
  HASH=$($NODE -e "h = require('crypto').createHash('sha256'); h.update(process.argv[1]); b = Buffer.from(h.digest()); console.log(b.toString('base64').replace(/[/+=]/g, '').slice(0,10));" $ID)
  echo "  deterministic device id: $HASH"
  echo "TR_DEVICEID=$HASH" >> .env

  # generate certificate signing request for MQTT broker
  echo "  generating CSR"
  mkdir -p $DIR/certs
  # openssl rand -out .rnd -writerand ~/.rnd # seems to be required on some systems
  openssl rand 2048 > $HOME/.rnd
  # openssl genrsa -out $DIR/certs/client.key -rand $DIR/.rnd 2048 2>/dev/null
  openssl genrsa -out $DIR/certs/client.key 2048 2>/dev/null
  openssl req -out $DIR/certs/client.csr -key $DIR/certs/client.key -new -subj "/CN=[id]:$HASH"

  # send certificate signing request to cloud
  echo "  sending CSR to [host]"
  # url-encode token: https://stackoverflow.com/a/10797966/1087119
  url=$(curl -s -o /dev/null -w %{url_effective} --get --data-urlencode "token=[token]" "[host]/csr")
  curl -sf --data-binary @$DIR/certs/client.csr $url -o $DIR/certs/client.crt


  printStep "Installing the agent"
  $NPM install > /dev/null

  printStep "Success!"
  touch $FLAG_FILE

else
  echo "Transitive Robotics robot-agent is already installed."
fi;


if [[ -d /run/systemd/system ]]; then
  # systemd is running, so the postinstall of the robot-agent will have already
  # started it via a systemd user service
  echo "  You can verify that the agent is running using 'systemctl --user status transitive-robot.service'"
else
  printStep "Starting the agent directly, since systemd is not running"
  # no systemd, start the agent right away manually
  for n in $(cat $HOME/.transitive/.env | grep -v "^#"); do export $n; done
  if [[ -f $HOME/.transitive/.env_user ]]; then
    for n in $(cat $HOME/.transitive/.env_user | grep -v "^#"); do export $n; done
  fi;
  cd $HOME/.transitive/node_modules/@transitive-robotics/robot-agent
  export PATH=$PATH:$HOME/.transitive/usr/sbin:$HOME/.transitive/usr/bin:$HOME/.transitive/sbin:$HOME/.transitive/bin
  while (true); do
    $NPM start;
    sleep 2;
    echo "Restarting the agent"
  done
fi;
