#! /bin/bash

function newWindow() {
  tmux new-window
  tmux rename-window $1
  tmux send "$2" C-m
}

# -----------------------------------
tmux new-session -s "cloud" -d
tmux send "roscore" C-m
tmux rename-window "roscore"

sleep 1

newWindow "ex:react" "cd examples/react-app && npm run start"
newWindow "ex:express" "cd examples/express && node server.js"
newWindow "cloud:build" "cd cloud/app && npx webpack"
newWindow "cloud:run" "cd cloud/app && node server.js"
# using webviz demo bag file from
# http://wiki.ros.org/rosbag/Tutorials/reading%20msgs%20from%20a%20bag%20file
newWindow "bag" "cd tmp && rosbag play -l webviz_diag.bag"
newWindow "robot" "cd robot_snap/health && node main.js"

tmux attach
