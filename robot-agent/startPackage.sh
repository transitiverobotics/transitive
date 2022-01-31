
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

export TRANSITIVE_IS_ROBOT=1
npm update --no-save
# Note: npm update also installs missing packages, see,
# https://stackoverflow.com/a/19824154/1087119
# But we still need to run `npm install` to make sure all dependencies
# are installed as well (e.g., if compilation of native code failed last time)
npm install --no-save

cd "node_modules/$1"
env PASSWORD=$(cat ../../../password) npm start
