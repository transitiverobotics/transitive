#!/bin/bash

# Get dpkg status and split it into separate file, in per package, named after
# package. This is so we can sort, re-assemble, and merge it again later with
# others. Note that the generated files already have an empty line at the end,
# so won't have to re-add that when re-assembling

# Easier to put pattern into variable, to avoid too much expansion magic. See
# https://stackoverflow.com/a/18710850/1087119
PATTERN="^Package: "

DIR=/tmp/dpkgStatus
[[ $# > 0 ]] && DIR=$1
mkdir -p $DIR

if [[ $(ls $DIR | wc -l) > 0 ]]; then
  echo "Target directory not empty, aborting"
  exit 1;
fi;

IFS='' # don't ignore spaces at the beginning of the line
# dpkg -s ## only works in 20.04
cat /var/lib/dpkg/status | while read line; do
  if [[ $line =~ $PATTERN ]]; then
    fileName="$DIR/${line:9}" # package name only
  fi
  if [[ ! -z $fileName ]]; then
    echo "$line" >> "$fileName"
  fi;
done
