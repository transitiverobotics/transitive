#!/bin/bash

echo "preparing sandbox for $TRPACKAGE ($USER)"

RODIR=/tmp/_tr_ro
TRHOME=/tmp/_tr_home

mkdir -p $RODIR
# hide some folders by bind-mounting an empty read-only folder on top of them
mount -o bind,ro $RODIR /var

mkdir -p $TRHOME/$USER
mkdir -p $TRHOME/transitive
mount --bind $HOME/.transitive/packages/$TRPACKAGE $TRHOME/transitive

for folder in usr bin sbin opt lib etc var run; do
  if [[ -e $HOME/.transitive/$folder ]]; then
    mkdir -p $TRHOME/$folder
    mount -o bind,ro $HOME/.transitive/$folder $TRHOME/$folder
  fi
done

mount --rbind $TRHOME /home
rm -f $TRHOME/$USER/.transitive
ln -s /home $TRHOME/$USER/.transitive

# fonts
rm -f /home/$USER/.fonts
ln -sf /home/usr/share/fonts /home/$USER/.fonts

# Shed fake root. This will make us nobody. If we need to be the original user
# instead we can try revertuid (see tmp/experiments/revertuid)
unshare -U bash -c "cd && $*"
