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
tmux -f tmux.conf new-session -s "cloud" -d
sleep 1
newWindow "cloud:build" "npm run build-dev"
newWindow "cloud:run" "npm start"
