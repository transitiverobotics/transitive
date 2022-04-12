
# run with package name as argument

# set -e

cd /home/transitive

if stat --printf='' /opt/ros/*/setup.bash 2>/dev/null; then
. /opt/ros/*/setup.bash;
fi

PATH=/home/usr/bin:$PATH
. /home/etc/env_local

# generate a random password for this package to use
node -e "fs.writeFileSync('password', Math.random().toString(36).substr(2, 9))"

export TRANSITIVE_IS_ROBOT=1

pid=

# trap SIGUSR1 and restart the node application
# The `-` in front of the pid ensures that the entire process group gets killed,
# i.e., not just the `npm start` command, but also the `node` process started by
# it. See https://unix.stackexchange.com/a/14853/53593.
trap '[[ $pid ]] && kill -SIGTERM -$pid && echo SIGUSR1: restarting -$pid' SIGUSR1
# trap '[[ $pid ]] && kill -SIGTERM -$pid && echo EXIT: stopping -$pid' EXIT

BASE=$PWD

set -m # start a new process group so we can kill it with -PID

echo "starting while loop for $1: pid = $$"
while :
do

   npm update --no-save
   # Note: npm update also installs missing packages, see,
   # https://stackoverflow.com/a/19824154/1087119
   # But we still need to run `npm install` to make sure all dependencies
   # are installed as well (e.g., if compilation of native code failed last time)
   npm install --no-save

   cd "$BASE/node_modules/$1"
   export PASSWORD=$(cat ../../../password)
   npm start &
   pid=$!
   echo "node process pid: $pid"

   wait
   pid=
   sleep 1
   echo "Restarting $1"
done
