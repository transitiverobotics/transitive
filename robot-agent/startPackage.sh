
# run with package name as argument

getROSRelease() {
  case $(lsb_release -sc) in
    xenial) echo kinetic;;
    bionic) echo melodic;;
    focal) echo noetic;;
    *) echo noetic;;
  esac
}

tryToSourceROS() {
  ROS_RELEASE=$1
  if [ -e /opt/ros/$ROS_RELEASE/setup.bash ]; then
    echo "found ROS $ROS_RELEASE, sourcing it";
    . /opt/ros/$ROS_RELEASE/setup.bash;
  fi
}

# set -e

cd /home/transitive

if [ "$TR_ROS_RELEASES" ]; then
  for release in $TR_ROS_RELEASES; do
    . /opt/ros/$release/setup.bash;
  done;
else
  # automatically decide which ROS1 release to source based on OS
  tryToSourceROS $(getROSRelease)

  # ROS 2:
  tryToSourceROS foxy
  tryToSourceROS galactic
  tryToSourceROS humble
  tryToSourceROS iron
  tryToSourceROS jazzy
  tryToSourceROS kilted
fi

PATH=/home/usr/bin:$PATH
. /home/etc/env_local

# generate a random password for this package to use
node -e "fs.writeFileSync('password', Math.random().toString(36).substr(2, 9))"

export TRANSITIVE_IS_ROBOT=1
# Required in order to install indirect dependencies from the @transitive-robotics scope
export npm_config_userconfig=$PWD/.npmrc

pid=

BASE=$PWD
STATUS_FILE="$BASE/status.json"
CONFIG_FILE="$BASE/config.json"

# trap SIGUSR1 and restart the node application
# The `-` in front of the pid ensures that the entire process group gets killed,
# i.e., not just the `npm start` command, but also the `node` process started by
# it. See https://unix.stackexchange.com/a/14853/53593.
trap '[[ $pid ]] && kill -SIGTERM -$pid && echo SIGUSR1: restarting -$pid' SIGUSR1
# need to also trap TERM so we can terminate the new process group started below
trap '[[ $pid ]] && kill -SIGTERM -$pid && echo SIGTERM: stopping -$pid and exiting ; rm -f $STATUS_FILE; exit' SIGTERM
# trap '[[ $pid ]] && kill -SIGTERM -$pid && echo EXIT: stopping -$pid' EXIT


set -m # start a new process group so we can kill it with -PID

echo "starting while loop for $1: pid = $$"
while :
do
  # be sure we are in the base directory before running update
  cd $BASE

  # Clear out old npm folders from a potentially failed update (or whatever
  # else leaves these beind, see
  # https://docs.npmjs.com/common-errors#many-enoent--enotempty-errors-in-output.
  rm -rf node_modules/.*-* node_modules/@*/.*-*

  # Check which node modules version we compiled this package with last and
  #  compare to current (none == 93, i.e.. node 16). If different, run `npm ci`
  # to recompile all native code and record current version.
  CURRENT_MODULES_VERSION=$(node -e "console.log(process.versions.modules)")
  COMPILED_MODULES_VERSION=$(cat .compiled_modules_version 2> /dev/null || echo "93")

  if [ -e package-lock.json ] && [ $CURRENT_MODULES_VERSION != $COMPILED_MODULES_VERSION ]; then
    echo "New node.js modules version detected ($CURRENT_MODULES_VERSION vs $COMPILED_MODULES_VERSION)"
    echo "Reinstalling to rebuild all native code in dependencies"
    echo '{"status": "reinstalling"}' > $STATUS_FILE
    rm -rf node_modules package-lock.json
    npm i --no-save && echo $CURRENT_MODULES_VERSION > .compiled_modules_version

  elif ! npm outdated; then
    # yes, `npm outdated` has a non-zero exit code iff there are outdated packages
    echo '{"status": "installing"}' > $STATUS_FILE
    npm update --no-save
    # Note: npm update also installs missing packages, see,
    # https://stackoverflow.com/a/19824154/1087119
    # But we still need to run `npm install` to make sure all dependencies
    # are installed as well (e.g., if compilation of native code failed last time)
    npm install --no-save

    # record the used node modules version, since this may be the first install
    echo $CURRENT_MODULES_VERSION > .compiled_modules_version
  fi;

  if [ -e $CONFIG_FILE ]; then
    # Config file exists
    if [ -s $CONFIG_FILE ]; then
      # Config file is not empty
      export TRCONFIG=$(cat $CONFIG_FILE)
    else
      # If the config file is empty
      echo "Config file $CONFIG_FILE is empty"
      export TRCONFIG="{}"
    fi
  else    
    echo "Config file $CONFIG_FILE not found"
     export TRCONFIG="{}"
  fi
  
  echo "TRCONFIG: $TRCONFIG"

  cd "$BASE/node_modules/$1"
  export PASSWORD=$(cat ../../../password)
  npm start &
  echo '{"status": "started"}' > $STATUS_FILE
  pid=$!
  echo "node process pid: $pid"

  wait
  pid=
  echo '{"status": "restarting"}' > $STATUS_FILE
  sleep 1
  echo "Restarting $1"
done
