#!/bin/bash

# launch a new u18ros instance in lxc, change machine-id, other preparations

if [[ $# < 1 ]]; then
  echo "need a name"
  exit
fi;

echo starting $1
lxc launch u18ros $1
sleep 1

# push init file
lxc file push instance_init.sh $1/tmp/instance_init.sh
sleep 0.2
# run init file in instance
lxc exec $1 -- /bin/bash /tmp/instance_init.sh
sleep 0.2
# restart instance for machine-id to take effect (otherwise journal logs will be empty)
lxc restart $1
sleep 1


# push tmux file
lxc file push instance_tmux.sh $1/home/cfritz/instance_tmux.sh
sleep 0.2
# run tmux file in instance
lxc exec $1 -- su cfritz --login -c ./instance_tmux.sh
#lxc exec $1 -- su cfritz --login -c "tmux a"
