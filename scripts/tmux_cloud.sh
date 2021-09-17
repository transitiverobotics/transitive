#! /bin/bash

# usage: newWindow NAME COMMAND [DIRECTORY]
function newWindow() {
  tmux new-window
  tmux rename-window $1
  if [[ $# > 2 ]]; then
    tmux send "cd \"$3\"" C-m
  fi;
  tmux send "$2" C-m
}

# -----------------------------------
tmux new-session -s "cloud" -d
tmux send "roscore" C-m
tmux rename-window "roscore"

sleep 1

#newWindow "ex:react" "npm run start" "examples/react-app"
newWindow "journalctl" "journalctl --user -f"
newWindow "proxy" "npm run dev" "../cloud/proxy"
newWindow "verdaccio" "node index.js" "../cloud/registry"
newWindow "cloud:build" "npx webpack --mode=development" "../cloud/app"
newWindow "cloud:run" "node server.js" "../cloud/app"
newWindow "portal" "ROOT_URL=http://$(hostname):8000 meteor" "../cloud/portal"
newWindow "bag" "rosbag play -l magni_diag.bag" "../tmp"
newWindow "health-cap" "# ./rundev.sh" "../../transitive-caps/health-monitoring"
newWindow "video-cap" "# ./rundev.sh" "../../transitive-caps/video-streaming"
newWindow "ex:express" "node server.js" "../examples/express"
newWindow "turtlesim" "rosrun turtlesim turtlesim_node"

tmux attach
