#!/bin/bash

echo "preparing sandbox for $TRPACKAGE ($USER)"

RODIR=/tmp/_tr_ro
TRHOME=/tmp/_tr_home

mkdir -p $RODIR
# hide some folders by bind-mounting an empty read-only folder on top of them
mount -o bind,ro $RODIR /var

mkdir -p $TRHOME/transitive
mkdir -p $TRHOME/usr
mkdir -p $TRHOME/$USER

mount --bind $HOME/.transitive/packages/$TRPACKAGE $TRHOME/transitive
mount --bind $HOME/.transitive/usr $TRHOME/usr

mount --rbind $TRHOME /home

# Shed fake root. This will make us nobody. If we need to be the original user
# instead we can try revertuid (see tmp/experiments/revertuid)
unshare -U bash -c "cd && $*"
