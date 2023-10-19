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

NAME=$(npm pkg get name)
NAME_UNQUOTED=${NAME//[\"\@]}
NAME_DOT=${NAME_UNQUOTED//\//\.}
VERSION=$(npm pkg get version)

BASENAME=$(basename $PWD)
echo -e "\033]0;$BASENAME\007"

tmux new-session -s "$BASENAME" -d
sleep 1
newWindow "robot:run" "./rundev.sh"
newWindow "test" "npm test"
newWindow "cloud:build" "npm run dev-build"
newWindow "cloud:docker" "./docker.sh"
newWindow "cloud:docker-shell" "# docker exec -it ${NAME_DOT}.${VERSION//\"} bash"
# TODO: generate correct container name

tmux a
