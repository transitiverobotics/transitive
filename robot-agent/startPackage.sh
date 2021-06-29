
# run with package name as argument

set -e

cd /home/transitive

if stat --printf='' /opt/ros/*/setup.bash 2>/dev/null; then
. /opt/ros/*/setup.bash;
fi

PATH=/home/usr/bin:$PATH
. /home/etc/env_local

# generate a random password for this package to use
node -e "fs.writeFileSync('password', Math.random().toString(36).substr(2, 9))"

npm update --no-save
# Note: npm update also installs missing packages, see,
# https://stackoverflow.com/a/19824154/1087119

cd node_modules/@transitive-robotics/$1
env PASSWORD=$(cat ../../../password) npm start
