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
npm --versions

if [[ -e /.dockerenv ]]; then
  echo "We are running in docker"
fi;

mkdir -p $RODIR/run
# hide the /var folder by bind-mounting an empty read-only folder on top of it
mount -o bind,ro $RODIR /var
# we need to bind mount /run back to /var/run for avahi/mdns to work
mount --rbind /run /var/run

# $REALUSER is not root when we are in an `unshare -r`
if [[ $REALUSER != "root" ]]; then
  # create fs overlays for /usr and /opt; will be bind-mounted later
  # TODO: this doesn't need to be per-capability; can't we create this once and
  # then use nsenter (or similar) to share that setup among caps?
  # No, I don't think so. There is no merging of mount namespaces I think.
  mkdir -p $HOME/.transitive/tmp
  TMP=$(mktemp -d -p $HOME/.transitive/tmp)
  for folder in usr opt; do
    mkdir -p $TMP/$folder/{workdir,merged}
    mkdir -p $HOME/.transitive/$folder # in case it doesn't exist
    mount -t overlay overlay -olowerdir=/$folder,upperdir=$HOME/.transitive/$folder,workdir=$TMP/$folder/workdir $TMP/$folder/merged

    # mount back any overlays and bind-mounts in the original
    for path in $(mount | grep "^overlay on /$folder" | cut -d ' ' -f 3); do
      subpath=$(echo $path | cut -d '/' -f 3-)
      echo $path $subpath
      mount --rbind $path $TMP/$folder/merged/$subpath
    done
    for path in $(mount | grep "^/dev/\S* on /$folder" | cut -d ' ' -f 3); do
      subpath=$(echo $path | cut -d '/' -f 3-)
      mount --rbind $path $TMP/$folder/merged/$subpath
    done

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
    mount --rbind -o ro $TMP/$folder/merged /$folder
  done;
fi;

mount --rbind $TRHOME /home
# When running as real root we need to do the above for /root as well:
mount --rbind $TRHOME /root

rm -f $TRHOME/$REALUSER/.transitive
ln -s /home $TRHOME/$REALUSER/.transitive
# for when running as root:
ln -sf /home /root/.transitive

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
#elif [[ $(id -u) == 0 ]]; then
# elif [[ $REALUSER != "root" ]]; then
#   # when not being real root we become nobody. If we need to be the
#   # original user instead we can try revertuid (see tmp/experiments/revertuid).
#   echo "becoming nobody"
#   unshare -U bash -c "cd && $*"
elif [[ $REALUID ]]; then
  echo "reverting to UID $REALUID again"
  /home/bin/revertuid $REALUID bash -c "cd && $*"
else
  echo "we are real root, staying root"
  bash -c "cd && $*"
fi;
