# Install script for robots
# We assume the shell is bash.

echo
echo "Installing Transitive Robotics robot-agent"

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
NODEURL=https://deb.nodesource.com/node_16.x/pool/main/n/nodejs/nodejs_16.14.0-deb-1nodesource1_${ARCH}.deb
NODEDEB=/tmp/transitive_nodejs16.deb
DIR=~/.transitive

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

# Record the fact that we have locally installed node.js 12. This is important
# so that packages cannot request a lower version to be installed over it. See
# aptLocal.sh.
mkdir -p var/lib/dpkg/status.d
dpkg-deb -e $NODEDEB var/lib/dpkg/status.d/nodejs
echo "Status: install ok installed" >> var/lib/dpkg/status.d/nodejs/control
echo "" >> var/lib/dpkg/status.d/nodejs/control


NODE=$DIR/usr/bin/node
NPM="$NODE $DIR/usr/bin/npm"

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
openssl rand -out .rnd -writerand ~/.rnd # seems to be required on some systems
openssl genrsa -out $DIR/certs/client.key -rand .rnd 2048 2>/dev/null
openssl req -out $DIR/certs/client.csr -key $DIR/certs/client.key -new -subj="/CN=[id]:$HASH"

# send certificate signing request to cloud
echo "  sending CSR to [host]"
curl -sf --data-binary @$DIR/certs/client.csr [host]/csr?token=[token] -o $DIR/certs/client.crt

printStep "Installing the agent"
$NPM install > /dev/null

printStep "Success!"
echo "  You can verify that the agent is running using 'systemctl --user status transitive-robot.service'"
