#!/bin/bash

# WARNING: DO NOT RUN THIS SCRIPT DIRECTLY! Run it in an `unshare -m`.


RODIR=/tmp/_tr_ro
TRHOME=/tmp/_tr_home
REALUSER=$USER
if [[ $SUDO_USER ]]; then
  REALUSER=$SUDO_USER;
else
  if [[ -z $REALUSER ]]; then
    REALUSER=$(id -un);
  fi;
fi
echo "preparing sandbox for $TRPACKAGE ($REALUSER)"

mkdir -p $RODIR
# hide some folders by bind-mounting an empty read-only folder on top of them
mount -o bind,ro $RODIR /var

# $REALUSER is not root when we are in an `unshare -r`
if [[ $REALUSER != "root" ]]; then
  # create fs overlays for /usr and /opt; will be bind-mounted later
  # TODO: this doesn't need to be per-capability; can't we create this once and
  # then use nsenter (or similar) to share that setup among caps?
  mkdir -p $HOME/.transitive/tmp
  TMP=$(mktemp -d -p $HOME/.transitive/tmp)
  for folder in usr opt; do
    mkdir -p $TMP/$folder/{workdir,merged}
    mkdir -p $HOME/.transitive/$folder # in case it doesn't exist
    mount -t overlay overlay -olowerdir=/$folder,upperdir=$HOME/.transitive/$folder,workdir=$TMP/$folder/workdir $TMP/$folder/merged
  done;
else
  echo "we are root, not using overlays";
fi;

mkdir -p $TRHOME/$REALUSER
mkdir -p $TRHOME/transitive
mount --bind $HOME/.transitive/packages/$TRPACKAGE $TRHOME/transitive

for folder in usr bin sbin opt lib etc var run; do
  if [[ -e $HOME/.transitive/$folder ]]; then
    mkdir -p $TRHOME/$folder
    mount -o bind,ro $HOME/.transitive/$folder $TRHOME/$folder
  fi
done

if [[ $REALUSER != "root" ]]; then
  # bind-mount our merged overlay directories onto /usr and /opt
  for folder in usr opt; do
    mount --bind $TMP/$folder/merged /$folder
  done;
fi;

mount --rbind $TRHOME /home
# When running as real root we need to do the above for /root as well:
mount --rbind $TRHOME /root

rm -f $TRHOME/$REALUSER/.transitive
ln -s /home $TRHOME/$REALUSER/.transitive

# fonts
rm -f /$HOME/.fonts
ln -sf /home/usr/share/fonts /$HOME/.fonts

# Shed fake root.
if [[ $SUDO_COMMAND ]]; then
  # when using SUDO we need to use `su`, otherwise we don't have write permissions
  # in the fake /home/transitive
  echo "sheding sudo and becoming $REALUSER again"
  chown -R $SUDO_UID:$SUDO_GID $TRHOME/$REALUSER
  su $REALUSER bash -c "cd && $*"
elif [[ $(id -u) == 0 ]]; then
  echo "we are root (possibly fake), staying root"
  bash -c "cd && $*"
else
  # when being root or in an `unshare -r` we become nobody. If we need to be the
  # original user instead we can try revertuid (see tmp/experiments/revertuid).
  echo "becoming nobody"
  unshare -U bash -c "cd && $*"
fi;
