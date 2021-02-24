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
newWindow "ex:express" "node server.js" "examples/express"
newWindow "journalctl" "journalctl --user -f"
newWindow "bag" "rosbag play -l diag_only.bag" "tmp"
newWindow "robot" "node main.js" "robot_snap/health"
newWindow "proxy" "node index.js" "cloud/proxy"
newWindow "verdaccio" "node index.js" "cloud/registry"
newWindow "cloud:build" "npx webpack" "cloud/app"
newWindow "cloud:run" "node server.js" "cloud/app"
newWindow "portal" "meteor" "cloud/portal"

tmux attach
