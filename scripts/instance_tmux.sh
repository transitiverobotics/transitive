#! /bin/bash

# tmux script to run in lxc instance

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


. /opt/ros/*/setup.bash

tmux new-session -s "transitive" -d
tmux send "roscore" C-m
tmux rename-window "roscore"

sleep 1

newWindow "journalctl" "journalctl --user -f"

tmux attach
