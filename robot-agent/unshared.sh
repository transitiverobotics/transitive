#!/bin/bash

# WARNING: DO NOT RUN THIS SCRIPT DIRECTLY! Run it in a `unshare -m`.

echo "preparing sandbox for $TRPACKAGE ($USER)"

RODIR=/tmp/_tr_ro
TRHOME=/tmp/_tr_home

mkdir -p $RODIR
# hide some folders by bind-mounting an empty read-only folder on top of them
mount -o bind,ro $RODIR /var

# create fs overlays for /usr and /opt; will be bind-mounted later
mkdir -p $HOME/.transitive/tmp
TMP=$(mktemp -d -p $HOME/.transitive/tmp)
for folder in usr opt; do
  mkdir -p $TMP/$folder/{workdir,merged}
  mkdir -p $HOME/.transitive/$folder # in case it doesn't exist
  mount -t overlay overlay -olowerdir=/$folder,upperdir=$HOME/.transitive/$folder,workdir=$TMP/$folder/workdir $TMP/$folder/merged
done;

mkdir -p $TRHOME/$USER
mkdir -p $TRHOME/transitive
mount --bind $HOME/.transitive/packages/$TRPACKAGE $TRHOME/transitive

for folder in usr bin sbin opt lib etc var run; do
  if [[ -e $HOME/.transitive/$folder ]]; then
    mkdir -p $TRHOME/$folder
    mount -o bind,ro $HOME/.transitive/$folder $TRHOME/$folder
  fi
done

# bind-mount our merged overlay directories onto /usr and /opt
for folder in usr opt; do
  mount --bind $TMP/$folder/merged /$folder
done;

mount --rbind $TRHOME /home
rm -f $TRHOME/$USER/.transitive
ln -s /home $TRHOME/$USER/.transitive

# fonts
rm -f /$HOME/.fonts
ln -sf /home/usr/share/fonts /$HOME/.fonts

# Shed fake root. This will make us nobody. If we need to be the original user
# instead we can try revertuid (see tmp/experiments/revertuid)
unshare -U bash -c "cd && $*"
